-- Audyt marketplace: oceny były publicznie czytelne razem z user_id, a
-- SECURITY DEFINER market_game_raters zwracało listę także anonimowi
-- (warunek sprawdzał tylko zalogowanego nie-autora).

drop policy if exists mgr_select on public.market_game_ratings;
create policy mgr_select on public.market_game_ratings
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.market_games mg
    where mg.id = market_game_id
      and mg.author_user_id = auth.uid()
  )
);

create or replace function public.market_game_raters(p_market_game_id uuid)
returns table(username text, stars smallint, rated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.market_games
    where id = p_market_game_id
      and author_user_id = auth.uid()
  ) then
    return;
  end if;

  return query
    select coalesce(pr.username, '?')::text, r.stars, r.created_at
    from public.market_game_ratings r
    left join public.profiles pr on pr.id = r.user_id
    where r.market_game_id = p_market_game_id
    order by r.created_at desc;
end;
$$;

-- Operacje administracyjne wykonuje maintenance-worker z service_role.
-- Domyślne EXECUTE dla PUBLIC pozwalało dowolnemu klientowi m.in. zatwierdzać
-- i trwale usuwać cudze gry.
revoke all on function public.market_admin_delete(uuid) from public, anon, authenticated;
revoke all on function public.market_admin_delete(uuid, boolean) from public, anon, authenticated;
revoke all on function public.market_admin_detail(uuid) from public, anon, authenticated;
revoke all on function public.market_admin_list(text) from public, anon, authenticated;
revoke all on function public.market_admin_producer_games() from public, anon, authenticated;
revoke all on function public.market_admin_review(uuid, text, text) from public, anon, authenticated;
revoke all on function public.market_admin_upsert(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.market_admin_withdraw(uuid) from public, anon, authenticated;

grant execute on function public.market_admin_delete(uuid) to service_role;
grant execute on function public.market_admin_delete(uuid, boolean) to service_role;
grant execute on function public.market_admin_detail(uuid) to service_role;
grant execute on function public.market_admin_list(text) to service_role;
grant execute on function public.market_admin_producer_games() to service_role;
grant execute on function public.market_admin_review(uuid, text, text) to service_role;
grant execute on function public.market_admin_upsert(text, text, text, jsonb) to service_role;
grant execute on function public.market_admin_withdraw(uuid) to service_role;

-- Powtarzalny E2E może usuwać wyłącznie własny stan z jawnym prefiksem.
create or replace function public.e2e_marketplace_cleanup(p_prefix text default 'E2E-MKT-')
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_games int := 0;
  v_market int := 0;
  v_ratings int := 0;
begin
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_uid is null
     or v_email !~ '^test[0-9]+@familiada[.]online$'
     or p_prefix not like 'E2E-MKT-%' then
    return jsonb_build_object('ok', false, 'error', 'test account and E2E-MKT- prefix required');
  end if;

  delete from public.market_game_ratings where user_id = v_uid;
  get diagnostics v_ratings = row_count;

  delete from public.games g
  where g.owner_id = v_uid
    and (
      g.name like p_prefix || '%'
      or exists (
        select 1 from public.market_games mg
        where mg.id = g.source_market_id and mg.title like p_prefix || '%'
      )
    );
  get diagnostics v_games = row_count;

  delete from public.market_games
  where author_user_id = v_uid and title like p_prefix || '%';
  get diagnostics v_market = row_count;

  return jsonb_build_object(
    'ok', true,
    'games_deleted', v_games,
    'market_games_deleted', v_market,
    'ratings_deleted', v_ratings
  );
end;
$$;

revoke all on function public.e2e_marketplace_cleanup(text) from public, anon;
grant execute on function public.e2e_marketplace_cleanup(text) to authenticated;

-- Aktualizacja oceny jest pełnoprawną nową akcją użytkownika; data używana
-- przez listę autora musi odzwierciedlać ostatnią zmianę, nie pierwszy zapis.
create or replace function public.market_rate_game(p_market_game_id uuid, p_stars int)
returns table(ok boolean, err text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return query select false, 'not_authenticated'; return; end if;
  if p_stars < 1 or p_stars > 5 then return query select false, 'invalid_stars'; return; end if;
  if not exists (select 1 from public.market_games where id = p_market_game_id and status = 'published') then
    return query select false, 'game_not_found'; return;
  end if;
  if exists (select 1 from public.market_games where id = p_market_game_id and author_user_id = v_uid) then
    return query select false, 'cannot_rate_own_game'; return;
  end if;

  insert into public.market_game_ratings (market_game_id, user_id, stars)
  values (p_market_game_id, v_uid, p_stars)
  on conflict (market_game_id, user_id) do update
    set stars = excluded.stars,
        created_at = now();

  return query select true, ''::text;
end;
$$;

-- Snapshot nie może pochodzić z JSON-u kontrolowanego przez klienta. Funkcja
-- zachowuje parametr dla zgodności ze starszym frontendem, ale składa payload
-- z autorytatywnych tabel w tej samej transakcji. Blokada po game_id zamyka też
-- wyścig dwóch kliknięć/retry tworzących dwa aktywne zgłoszenia.
create or replace function public.market_submit_game(
  p_game_id uuid,
  p_title text,
  p_description text,
  p_lang text,
  p_payload jsonb
)
returns table(ok boolean, err text, market_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games%rowtype;
  v_can_play boolean;
  v_payload jsonb;
  v_new uuid;
  v_ntfy_topic text;
begin
  if v_uid is null then return query select false, 'not_authenticated', null::uuid; return; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game
  from public.games
  where id = p_game_id
    and owner_id = v_uid
    and source_market_id is null
    and is_demo = false;

  if not found then return query select false, 'game_not_found', null::uuid; return; end if;

  if exists (
    select 1 from public.market_games
    where author_user_id = v_uid
      and source_game_id = p_game_id
      and status in ('pending', 'published')
  ) then
    return query select false, 'already_submitted', null::uuid; return;
  end if;

  select can_play into v_can_play from public.game_action_state(p_game_id);
  if not coalesce(v_can_play, false) then
    return query select false, 'game_not_playable', null::uuid; return;
  end if;

  if p_lang not in ('pl', 'en', 'uk') then return query select false, 'invalid_lang', null::uuid; return; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    return query select false, 'invalid_title', null::uuid; return;
  end if;
  if char_length(btrim(coalesce(p_description, ''))) > 500 then
    return query select false, 'invalid_description', null::uuid; return;
  end if;

  select jsonb_build_object(
    'game', jsonb_build_object(
      'name', v_game.name,
      'type', case
        when v_game.status = 'ready' and v_game.type in ('poll_text', 'poll_points') then 'prepared'
        else v_game.type::text
      end
    ),
    'questions', coalesce(jsonb_agg(
      jsonb_build_object(
        'text', q.text,
        'answers', coalesce((
          select jsonb_agg(
            jsonb_build_object('text', a.text, 'fixed_points', a.fixed_points)
            order by a.ord
          )
          from public.answers a where a.question_id = q.id
        ), '[]'::jsonb)
      ) order by q.ord
    ), '[]'::jsonb)
  ) into v_payload
  from public.questions q
  where q.game_id = p_game_id;

  if jsonb_array_length(v_payload -> 'questions') < 10 then
    return query select false, 'too_few_questions', null::uuid; return;
  end if;

  insert into public.market_games
    (author_user_id, source_game_id, title, description, lang, status, payload)
  values
    (v_uid, p_game_id, btrim(p_title), btrim(coalesce(p_description, '')), p_lang, 'pending', v_payload)
  returning id into v_new;

  begin
    select value into v_ntfy_topic from public.app_config where key = 'ntfy_topic';
    if v_ntfy_topic is not null and v_ntfy_topic <> '' then
      perform net.http_post(
        url := 'https://ntfy.sh/' || v_ntfy_topic,
        body := jsonb_build_object(
          'title', 'Nowe zgłoszenie (' || p_lang || ')',
          'message', btrim(p_title),
          'priority', 3
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    null;
  end;

  return query select true, null::text, v_new;
end;
$$;
