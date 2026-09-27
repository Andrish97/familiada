-- Migration 273: game_validate(p_game_id) -- jedno źródło prawdy o tym,
-- co wolno zrobić z grą
--
-- Warunki "czy można edytować / grać / otworzyć lub zamknąć ankietę" były
-- rozsiane po przeglądarce: js/core/game-validate.js (games, editor,
-- control, polls-hub), własne kopie w polls.js i do tego game_action_state
-- w bazie -- trzy wersje tych samych reguł, każda trochę inna (np.
-- game_action_state nie pozwalało grać grą ze Społeczności, a
-- game-validate.js tak), komunikaty tylko po polsku, a zamknięcie ankiety
-- robiło po kilka zapytań na pytanie.
--
-- Teraz liczy to jedna funkcja. Dla każdej akcji zwraca
--   { "ok": true }  albo  { "ok": false, "code": "<klucz>", "params": {...} }
-- a strona tłumaczy code przez t("gameValidate.<code>", params).
--
-- Akcje: edit (+ needs_reset), play, poll_entry (wejście na stronę ankiety),
-- poll_open (uruchomienie / ponowne uruchomienie), poll_close, export.
-- Reguły (10 pytań, 3–6 odpowiedzi, suma ≤ 100) są też w "rules", żeby
-- strony nie trzymały własnych kopii liczb.
--
-- game_action_state zostaje (stare wersje strony z cache), nowy kod go nie
-- używa.

create or replace function public.game_validate(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c_qmin constant int := 10;
  c_amin constant int := 3;
  c_amax constant int := 6;
  c_sum  constant int := 100;
  c_ok   constant jsonb := '{"ok": true}'::jsonb;

  v_uid uuid := auth.uid();
  g record;
  r record;
  v_qn int;
  v_minq jsonb;       -- za mało pytań
  v_struct jsonb;     -- pierwsze pytanie ze złą liczbą odpowiedzi
  v_points jsonb;     -- pierwsze pytanie złe dla gry preparowanej
  v_content_poll jsonb;
  v_edit jsonb;
  v_play jsonb;
  v_poll_entry jsonb;
  v_poll_open jsonb;
  v_poll_close jsonb;
  v_export jsonb;
  v_strong int;
  v_distinct int;
  v_is_poll boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type::text as type, status::text as status, updated_at
    into g
  from public.games
  where id = p_game_id and owner_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_is_poll := g.type in ('poll_text', 'poll_points');

  /* ---------- treść: pytania i odpowiedzi ---------- */
  select count(*)::int into v_qn from public.questions where game_id = p_game_id;

  if v_qn < c_qmin then
    v_minq := jsonb_build_object('ok', false, 'code', 'minQuestions',
      'params', jsonb_build_object('min', c_qmin, 'n', v_qn));
  end if;

  for r in
    select q.ord,
           count(a.id)::int as cnt,
           coalesce(min(a.fixed_points), 0)::int as minp,
           coalesce(max(a.fixed_points), 0)::int as maxp,
           coalesce(sum(a.fixed_points), 0)::int as sump
    from public.questions q
    left join public.answers a on a.question_id = q.id
    where q.game_id = p_game_id
    group by q.id, q.ord
    order by q.ord
  loop
    if v_struct is null and (r.cnt < c_amin or r.cnt > c_amax) then
      v_struct := jsonb_build_object('ok', false, 'code', 'answersRange',
        'params', jsonb_build_object('ord', r.ord, 'min', c_amin, 'max', c_amax, 'n', r.cnt));
    end if;

    if v_points is null then
      v_points := case
        when r.cnt < c_amin or r.cnt > c_amax then v_struct
        when r.minp < 0 then jsonb_build_object('ok', false, 'code', 'negativePoints',
          'params', jsonb_build_object('ord', r.ord))
        when r.maxp > 100 then jsonb_build_object('ok', false, 'code', 'answerOver100',
          'params', jsonb_build_object('ord', r.ord))
        when r.sump > c_sum then jsonb_build_object('ok', false, 'code', 'sumTooBig',
          'params', jsonb_build_object('ord', r.ord, 'max', c_sum, 'sum', r.sump))
        else null
      end;
    end if;

    exit when v_struct is not null and v_points is not null;
  end loop;

  -- czy treść wystarcza do uruchomienia ankiety
  v_content_poll := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when v_minq is not null then v_minq
    when g.type = 'poll_points' and v_struct is not null then v_struct
    else c_ok
  end;

  /* ---------- edit ---------- */
  v_edit := case
    when g.type = 'prepared' then jsonb_build_object('ok', true, 'needs_reset', false)
    when g.type = 'market' then jsonb_build_object('ok', false, 'code', 'marketNoEdit')
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollOpenNoEdit')
    when g.status = 'ready' then jsonb_build_object('ok', true, 'needs_reset', true)
    else jsonb_build_object('ok', true, 'needs_reset', false)
  end;

  /* ---------- play ---------- */
  v_play := case
    when v_is_poll and g.status <> 'ready' then jsonb_build_object('ok', false, 'code', 'playAfterPoll')
    when v_is_poll then c_ok
    when g.type in ('prepared', 'market') then coalesce(v_minq, v_points, c_ok)
    else jsonb_build_object('ok', false, 'code', 'unknownType')
  end;

  /* ---------- ankieta ---------- */
  v_poll_entry := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status in ('poll_open', 'ready') then c_ok
    else v_content_poll
  end;

  v_poll_open := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollAlreadyOpen')
    else v_content_poll
  end;

  if not v_is_poll then
    v_poll_close := jsonb_build_object('ok', false, 'code', 'preparedNoPoll');
  elsif g.status <> 'poll_open' then
    v_poll_close := jsonb_build_object('ok', false, 'code', 'closeOnlyOpen');
  elsif exists (
    select 1 from public.poll_tasks t
    where t.owner_id = v_uid and t.game_id = p_game_id
      and t.done_at is null and t.declined_at is null and t.cancelled_at is null
  ) then
    -- ktoś z zaproszonych jeszcze nie zagłosował
    v_poll_close := jsonb_build_object('ok', false, 'code', 'closeWaitForTasks');
  else
    v_poll_close := c_ok;
    for r in
      select q.id, q.ord,
             (select ps.id from public.poll_sessions ps
               where ps.game_id = p_game_id and ps.question_id = q.id
               order by ps.created_at desc limit 1) as sid
      from public.questions q
      where q.game_id = p_game_id
      order by q.ord
    loop
      if r.sid is null then
        v_poll_close := jsonb_build_object('ok', false, 'code', 'noSession',
          'params', jsonb_build_object('ord', r.ord));
        exit;
      end if;

      if g.type = 'poll_points' then
        -- Głosy przeliczone na 100 pkt metodą największych reszt (jak przy
        -- zamykaniu); w pytaniu muszą być ≥ 3 odpowiedzi z ≥ 3 pkt.
        with c as (
          select v.answer_id, count(*)::int as cnt, coalesce(max(a.ord), 99) as aord
          from public.poll_votes v
          left join public.answers a on a.id = v.answer_id
          where v.poll_session_id = r.sid and v.question_id = r.id and v.answer_id is not null
          group by v.answer_id
        ),
        raw as (
          select c.aord,
                 100.0 * c.cnt / sum(c.cnt) over () as rp,
                 floor(100.0 * c.cnt / sum(c.cnt) over ())::int as fl
          from c
        ),
        d as (
          select raw.fl,
                 100 - sum(raw.fl) over () as diff,
                 row_number() over (order by raw.rp - raw.fl desc, raw.aord) as rn
          from raw
        )
        select count(*)::int into v_strong
        from d
        where d.fl + (case when d.rn <= d.diff then 1 else 0 end) >= 3;

        if coalesce(v_strong, 0) < 3 then
          v_poll_close := jsonb_build_object('ok', false, 'code', 'closeMinPoints',
            'params', jsonb_build_object('ord', r.ord));
          exit;
        end if;
      else
        select count(distinct nullif(btrim(e.answer_norm), ''))::int into v_distinct
        from public.poll_text_entries e
        where e.poll_session_id = r.sid and e.question_id = r.id;

        if coalesce(v_distinct, 0) < 3 then
          v_poll_close := jsonb_build_object('ok', false, 'code', 'closeMinText',
            'params', jsonb_build_object('ord', r.ord));
          exit;
        end if;
      end if;
    end loop;
  end if;

  /* ---------- eksport ---------- */
  v_export := case
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollOpenNoExport')
    else c_ok
  end;

  return jsonb_build_object(
    'ok', true,
    'game', jsonb_build_object('id', g.id, 'type', g.type, 'status', g.status, 'rev', g.updated_at),
    'rules', jsonb_build_object('qn_min', c_qmin, 'an_min', c_amin, 'an_max', c_amax, 'sum_max', c_sum),
    'edit', v_edit,
    'play', v_play,
    'poll_entry', v_poll_entry,
    'poll_open', v_poll_open,
    'poll_close', v_poll_close,
    'export', v_export
  );
end;
$$;

revoke all on function public.game_validate(uuid) from public, anon;
grant execute on function public.game_validate(uuid) to authenticated;

notify pgrst, 'reload schema';
