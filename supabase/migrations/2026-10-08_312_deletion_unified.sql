-- Migration 312: ujednolicone usuwanie gry i konta (E12, docs/usuwanie-danych.md).
-- Tylko do przodu. Zmiany względem poprzednich ciał funkcji oznaczone "-- 312:".
--  * delete_resource_checked('game'): otwarta ankieta nie blokuje (jest przerywana),
--    zajęta blokada gry nadal blokuje; kasuje maile z kolejki z linkami zaproszeń
--    tej gry oraz shared_devices gry.
--  * market_remove_from_library: przez delete_resource_checked (sprawdza blokadę).
--  * delete_user_everything: nadrzędne wobec blokad; głosy w cudzych ankietach
--    zostają anonimowe; usuwa dane powiązane z e-mailem konta.
--    guest_cleanup_expired woła tę funkcję (bez zmian, już sprząta Storage).
--  * guest_discard_current: po usunięciu woła też cleanup-guest-storage (pliki gościa).
--  * Reguła RLS games_owner_delete ZOSTAJE: testy e2e sprzątają gry bezpośrednim delete.
BEGIN;

CREATE OR REPLACE FUNCTION "public"."delete_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 312: otwarta ankieta nie blokuje usunięcia (zostaje przerwana: głosy, sesje
    -- i zaproszenia znikają kaskadą). Blokuje tylko zajęta blokada gry.

    select resource_type into v_blocker
    from public.edit_locks
    where resource_type = 'game'
      and resource_id = p_resource_id
      and heartbeat_at > now() - interval '25 seconds'
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- 312: maile w kolejce z zaproszeniami do ankiety tej gry (link
    -- poll-go?t=<token> w treści; mail_queue nie ma kolumny z identyfikatorem gry).
    delete from public.mail_queue q
    using public.poll_tasks pt
    where pt.game_id = p_resource_id
      and position(('poll-go?t=' || pt.token::text) in q.html) > 0;

    -- 312: zapamiętane urządzenia tej gry (FK dałby tylko SET NULL).
    delete from public.shared_devices where game_id = p_resource_id;

    delete from public.games where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'logo' then
    if not exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- Warstwa A: to konkretne logo ma aktywną sesję edycji gdzie indziej
    -- (logo-editor.js trzyma acquire_edit_lock('logo', ten id, ...)).
    if exists (
      select 1 from public.edit_locks
      where resource_type = 'logo'
        and resource_id = p_resource_id
        and heartbeat_at > now() - interval '25 seconds'
    ) then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- Warstwa B: cała pula logo właściciela jest busy, gdy ma aktywną
    -- rozgrywkę (Control) lub otwarte game-settings.js dla którejkolwiek
    -- swojej gry -- niezależnie od tego, czy TO konkretne logo jest przez
    -- nią referencowane.
    select holder_context into v_blocker
    from public.edit_locks
    where resource_type = 'game'
      and holder_user_id = v_uid
      and holder_context in ('settings', 'control')
      and heartbeat_at > now() - interval '25 seconds'
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', v_blocker.holder_context);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- Którykolwiek element WEWNĄTRZ tej bazy (pytanie/folder/tag) ma teraz
    -- aktywną sesję edycji (Warstwa 1, migracja 257) -- usunięcie całej
    -- bazy skasowałoby go (CASCADE) spod ręki edytującego bez ostrzeżenia.
    if exists (
      select 1 from public.edit_locks l
      where l.heartbeat_at > now() - interval '25 seconds'
        and (
          (l.resource_type = 'base_question' and exists (
            select 1 from public.qb_questions q where q.id = l.resource_id and q.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_folder' and exists (
            select 1 from public.qb_categories c where c.id = l.resource_id and c.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_tag' and exists (
            select 1 from public.qb_tags t where t.id = l.resource_id and t.base_id = p_resource_id
          ))
        )
    ) then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    delete from public.question_bases where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."market_remove_from_library"("p_market_game_id" "uuid") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_uid uuid := auth.uid();
    v_game record;
    v_res jsonb;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    -- 312: usunięcie kopii idzie tą samą drogą co lista gier
    -- (delete_resource_checked: blokada gry, maile, urządzenia).
    for v_game in
        select id from public.games
         where owner_id = v_uid
           and source_market_id = p_market_game_id
    loop
        v_res := public.delete_resource_checked('game', v_game.id);
        if coalesce((v_res->>'ok')::boolean, false) = false
           and coalesce(v_res->>'error', '') <> 'not_found_or_forbidden' then
            -- cała operacja wraca (RETURN przed usunięciem wpisu bibliotecznego;
            -- kopie usunięte wcześniej w tej pętli zostają usunięte)
            return query select false, 'locked';
            return;
        end if;
    end loop;

    -- usuń wpis biblioteczny
    delete from public.user_market_library
     where user_id        = v_uid
       and market_game_id = p_market_game_id;

    return query select true, '';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_user_everything"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_emails text[];
  v_email text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 312: e-maile konta (małymi literami) -- po nich czyścimy dane bez user_id
  select coalesce(array_agg(distinct e), array[]::text[]) into v_emails
  from (
    select lower(trim(u.email)) as e from auth.users u where u.id = p_user_id
    union
    select lower(trim(p.email)) from public.profiles p where p.id = p_user_id
  ) x
  where e is not null and e <> '';

  -- 312: usunięcie konta jest nadrzędne -- nie sprawdza blokad (edit_locks);
  -- blokady trzymane przez to konto i na jego zasobach znikają.
  delete from public.edit_locks where holder_user_id = p_user_id;
  delete from public.edit_locks
   where (resource_type = 'game' and resource_id in (select id from public.games where owner_id = p_user_id))
      or (resource_type = 'base' and resource_id in (select id from public.question_bases where owner_id = p_user_id))
      or (resource_type = 'logo' and resource_id in (select id from public.user_logos where user_id = p_user_id));

  -- 312: głosy w cudzych ankietach zostają anonimowe (bez powiązania z kontem);
  -- głosy w własnych grach znikają razem z grami niżej.
  update public.poll_text_entries set voter_user_id = null where voter_user_id = p_user_id;
  update public.poll_votes set voter_user_id = null where voter_user_id = p_user_id;

  delete from public.poll_subscriptions where subscriber_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  -- 312: zaproszenia do baz (po user_id i po e-mailu)
  delete from public.base_share_tasks where recipient_user_id = p_user_id;
  delete from public.base_share_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  -- 312: gry (maile ankietowe właściciela znikają niżej przez created_by)
  delete from public.shared_devices where game_id in (select id from public.games where owner_id = p_user_id);
  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- 312: wszystko powiązane z e-mailem konta
  delete from public.mail_queue where created_by = p_user_id;
  delete from public.mail_function_logs where actor_user_id = p_user_id;
  delete from public.email_intents where user_id = p_user_id;
  delete from public.contact_reports where user_id = p_user_id;
  delete from public.mail_cooldowns
   where position(p_user_id::text in target_key) > 0;

  foreach v_email in array v_emails loop
    delete from public.poll_subscriptions where lower(subscriber_email) = v_email;
    delete from public.poll_tasks where lower(recipient_email) = v_email;
    delete from public.base_share_tasks where lower(recipient_email) = v_email;
    delete from public.mail_queue where lower(trim(to_email)) = v_email;
    delete from public.mail_function_logs where lower(recipient_email) = v_email;
    delete from public.email_unsub_tokens where lower(email) = v_email;
    delete from public.email_intents where lower(email) = v_email;
    delete from public.email_cooldowns where email_hash = md5(v_email);
    delete from public.mail_cooldowns where position(md5(v_email) in target_key) > 0;
    delete from public.contact_reports where lower(email) = v_email;
  end loop;

  -- profile first (also cascades by FK from auth.users if still present)
  delete from public.profiles where id = p_user_id;

  -- final auth user hard delete
  delete from auth.users where id = p_user_id;
end;
$$;

-- 312: porzucenie konta gościa sprząta też Storage (jak guest_cleanup_expired):
-- po usunięciu z bazy woła edge function cleanup-guest-storage.
CREATE OR REPLACE FUNCTION "public"."guest_discard_current"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean := false;
  v_url text;
  v_jwt text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false)
    into v_is_guest
  from public.profiles
  where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  perform public.delete_user_everything(v_uid);

  -- 312: pliki po usunięciu z bazy (baza najpierw)
  select value into v_url from public.app_config where key = 'edge_url';
  select value into v_jwt from public.app_config where key = 'edge_service_role_jwt';
  if coalesce(v_url, '') <> '' and coalesce(v_jwt, '') <> '' then
    perform net.http_post(
      url := v_url || '/functions/v1/cleanup-guest-storage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_jwt,
        'apikey', v_jwt
      ),
      body := jsonb_build_object('userId', v_uid)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

COMMIT;
