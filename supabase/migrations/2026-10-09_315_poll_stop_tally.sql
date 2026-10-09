-- Migracja 315: ankiety — stan „zatrzymana” (poll_stopped), Zatrzymaj / Wznów / Podlicz.
-- Decyzje 2026-10-09 (docs/ankiety-refaktor.md, sekcja 1). Tylko dodające zmiany:
-- dotychczasowe RPC (poll_open, poll_abort, poll_points_close_and_normalize,
-- poll_text_close_apply, ...) działają jak dotąd; obecny front nadal ich używa.
--
-- Przepływ: poll_open ──poll_stop──▶ poll_stopped ──poll_resume──▶ poll_open
--           poll_stopped ──poll_points_tally / poll_text_tally_apply──▶ ready
--           poll_stopped ──poll_abort──▶ draft
-- Zatrzymana: klucz i zaproszenia ważne, głosy zachowane, baza odrzuca nowe głosy
-- (wszystkie RPC głosujące sprawdzają status = poll_open). Podliczenie zamyka
-- ankietę i wygasza linki: klucz ankiety jest rotowany, czekające zaproszenia
-- usuwane, kod QR kasowany.
--
-- UWAGA (struktura pliku): nowa wartość enuma nie może być użyta w tej samej
-- transakcji, w której ją dodano. apply-migrations.sh puszcza plik przez
-- `psql -1`; dlatego ALTER TYPE jest w pierwszej transakcji, którą zamyka
-- jawny COMMIT, a reszta idzie w drugiej (BEGIN ... COMMIT). Końcowy COMMIT
-- z `-1` da tylko ostrzeżenie „no transaction in progress”.

ALTER TYPE "public"."game_status" ADD VALUE IF NOT EXISTS 'poll_stopped' AFTER 'poll_open';

COMMIT;

BEGIN;

-- ============================================================
-- 1. Dane: ograniczenia statusu, klucz „zakończonej” ankiety, szkic podliczania
-- ============================================================

ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_poll_status_ok;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;

ALTER TABLE public.games ADD CONSTRAINT games_poll_status_ok CHECK (
  (type IN ('prepared'::game_type, 'market'::game_type)
     AND status IN ('draft'::game_status, 'ready'::game_status))
  OR
  (type NOT IN ('prepared'::game_type, 'market'::game_type)
     AND status IN ('draft'::game_status, 'poll_open'::game_status, 'poll_stopped'::game_status, 'ready'::game_status))
);
ALTER TABLE public.games ADD CONSTRAINT games_status_check CHECK (
  status IN ('draft'::game_status, 'poll_open'::game_status, 'poll_stopped'::game_status, 'ready'::game_status)
);

-- Klucz ankiety z chwili podliczenia: pozwala stronie głosowania odróżnić
-- „Ankieta zakończona” (stary link tej ankiety) od „Ten link wygasł”
-- (link z wcześniejszego uruchomienia). Czyszczony przy nowym uruchomieniu / przerwaniu.
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS poll_ended_key text;

-- Szkic scalania odpowiedzi ankiety tekstowej (stan okna „Podlicz”). Osobna tabela,
-- żeby nie obciążać wierszy games (lista gier czyta je hurtem). Dostęp tylko przez RPC.
CREATE TABLE IF NOT EXISTS public.poll_tally_drafts (
  game_id    uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  draft      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.poll_tally_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.poll_tally_drafts FROM PUBLIC, anon, authenticated;

-- Nowe uruchomienie (nie wznowienie) i przerwanie czyszczą klucz zakończonej ankiety i szkic.
CREATE OR REPLACE FUNCTION public.games_poll_state_reset() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF new.status IS DISTINCT FROM old.status
     AND (new.status = 'draft'
          OR (new.status = 'poll_open' AND old.status IS DISTINCT FROM 'poll_stopped')) THEN
    new.poll_ended_key := NULL;
    DELETE FROM public.poll_tally_drafts WHERE game_id = new.id;
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS trg_games_poll_state_reset ON public.games;
CREATE TRIGGER trg_games_poll_state_reset
  BEFORE UPDATE OF status ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.games_poll_state_reset();

-- ============================================================
-- 2. Funkcje istniejące rozszerzone o poll_stopped (CREATE OR REPLACE z schema.sql,
--    zmiany oznaczone w treści; reszta bez zmian)
-- ============================================================

-- game_rules_compute
CREATE OR REPLACE FUNCTION "public"."game_rules_compute"("p_game_id" "uuid", "p_type" "text", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_qmin constant int := 10;
  c_amin constant int := 3;
  c_amax constant int := 6;
  c_sum  constant int := 100;
  c_ok   constant jsonb := '{"ok": true}'::jsonb;

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
  v_export jsonb;
  v_poll_stop jsonb;
  v_poll_resume jsonb;
  v_is_poll boolean;
begin
  select p_type as type, p_status as status into g;

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
    when g.status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStoppedNoEdit')
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
    when g.status in ('poll_open', 'poll_stopped', 'ready') then c_ok
    else v_content_poll
  end;

  v_poll_open := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollAlreadyOpen')
    when g.status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStopped')
    else v_content_poll
  end;

  /* ---------- eksport ---------- */
  v_export := case
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollOpenNoExport')
    when g.status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStoppedNoExport')
    else c_ok
  end;

  /* ---------- zatrzymanie / wznowienie (315) ---------- */
  v_poll_stop := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_open' then c_ok
    else jsonb_build_object('ok', false, 'code', 'stopOnlyOpen')
  end;

  v_poll_resume := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_stopped' then c_ok
    else jsonb_build_object('ok', false, 'code', 'resumeOnlyStopped')
  end;

  return jsonb_build_object(
    'rules', jsonb_build_object('qn_min', c_qmin, 'an_min', c_amin, 'an_max', c_amax, 'sum_max', c_sum),
    'edit', v_edit,
    'play', v_play,
    'poll_entry', v_poll_entry,
    'poll_open', v_poll_open,
    'export', v_export,
    'poll_stop', v_poll_stop,
    'poll_resume', v_poll_resume
  );
end;
$$;

-- game_poll_close_check
CREATE OR REPLACE FUNCTION "public"."game_poll_close_check"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_ok constant jsonb := '{"ok": true}'::jsonb;
  g record;
  r record;
  v_poll_close jsonb;
  v_strong int;
  v_distinct int;
begin
  select id, owner_id, type::text as type, status::text as status
    into g
  from public.games
  where id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'noGame');
  end if;

  if g.type not in ('poll_text', 'poll_points') then
    v_poll_close := jsonb_build_object('ok', false, 'code', 'preparedNoPoll');
  elsif g.status not in ('poll_open', 'poll_stopped') then
    v_poll_close := jsonb_build_object('ok', false, 'code', 'closeOnlyOpen');
  -- E11b: usunięty warunek „czekające zaproszenia blokują zamknięcie” (closeWaitForTasks)
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

  return v_poll_close;
end;
$$;

-- game_action_state
CREATE OR REPLACE FUNCTION "public"."game_action_state"("p_game_id" "uuid") RETURNS TABLE("game_id" "uuid", "rev" timestamp with time zone, "can_edit" boolean, "needs_reset_warning" boolean, "can_play" boolean, "can_poll" boolean, "can_export" boolean, "reason_play" "text", "reason_poll" "text")
    LANGUAGE "sql" STABLE
    AS $$
with g as (
  select id, type, status, updated_at
  from public.games
  where id = p_game_id
),
qs as (
  select id, ord
  from public.questions
  where game_id = p_game_id
),
ans as (
  select
    a.question_id,
    count(*) as cnt,
    min(coalesce(a.fixed_points,0)) as minp,
    max(coalesce(a.fixed_points,0)) as maxp,
    sum(coalesce(a.fixed_points,0)) as sump
  from public.answers a
  join qs on qs.id = a.question_id
  group by a.question_id
),
agg as (
  select
    coalesce((select count(*) from qs), 0) as qn,
    coalesce((select min(cnt) from ans), 0) as an_min,
    coalesce((select max(cnt) from ans), 0) as an_max,
    coalesce((select bool_or(sump > 100) from ans), false) as sum_too_big,
    coalesce((select bool_or(minp < 0) from ans), false) as neg_pts,
    coalesce((select bool_or(maxp > 100) from ans), false) as over_pts
)
select
  g.id as game_id,
  g.updated_at as rev,

  /* EDIT — zgodnie z canEnterEdit() */
  case
    when g.type = 'prepared' then true
    when g.status in ('poll_open', 'poll_stopped') then false
    else true
  end as can_edit,

  /* warning resetu tylko dla poll_* w READY */
  (g.type <> 'prepared' and g.status = 'ready') as needs_reset_warning,

  /* PLAY — zgodnie z validateGameReadyToPlay() */
  case
    when g.type in ('poll_text','poll_points') then (g.status = 'ready')
    when g.type = 'prepared' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
      and not (select sum_too_big from agg)
      and not (select neg_pts from agg)
      and not (select over_pts from agg)
    else false
  end as can_play,

  /* POLL — zgodnie z validatePollEntry() + validatePollReadyToOpen() */
  case
    when g.type = 'prepared' then false
    when g.type = 'poll_text' then (select qn from agg) >= 10
    when g.type = 'poll_points' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
    else false
  end as can_poll,

  /* eksport: blokuj gdy sondaż otwarty */
  case
    when g.status in ('poll_open', 'poll_stopped') then false
    else true
  end as can_export,

  /* reason_play (opcjonalnie) */
  case
    when g.type in ('poll_text','poll_points') and g.status <> 'ready'
      then 'Gra dostępna dopiero po zamknięciu sondażu.'
    when g.type = 'prepared' and (select qn from agg) < 10
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'prepared' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    when g.type = 'prepared' and (select neg_pts from agg)
      then 'Punkty nie mogą być ujemne.'
    when g.type = 'prepared' and (select over_pts from agg)
      then 'Odpowiedź nie może mieć > 100 pkt.'
    when g.type = 'prepared' and (select sum_too_big from agg)
      then 'Suma punktów w pytaniu nie może przekroczyć 100.'
    else null
  end as reason_play,

  /* reason_poll (opcjonalnie) */
  case
    when g.type = 'prepared'
      then 'Preparowany nie ma sondażu.'
    when (g.type in ('poll_text','poll_points') and (select qn from agg) < 10)
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'poll_points' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    else null
  end as reason_poll
from g, agg;
$$;

-- poll_abort
CREATE OR REPLACE FUNCTION "public"."poll_abort"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  v_key text := public.gen_share_key(18);
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
    RAISE EXCEPTION 'poll_not_abortable';
  END IF;

  DELETE FROM public.poll_votes WHERE game_id = p_game_id;
  DELETE FROM public.poll_text_entries WHERE game_id = p_game_id;
  DELETE FROM public.poll_sessions WHERE game_id = p_game_id;
  DELETE FROM public.poll_tasks WHERE game_id = p_game_id;
  DELETE FROM public.device_connect_codes WHERE game_id = p_game_id AND device_type = 'poll_qr';

  UPDATE public.games
     SET status = 'draft', poll_opened_at = NULL, poll_closed_at = NULL,
         share_key_poll = v_key, updated_at = now()
   WHERE id = p_game_id;

  -- jak game_reset_poll_for_edit: wyniki zerowane
  UPDATE public.answers a
     SET fixed_points = 0
    FROM public.questions q
   WHERE q.id = a.question_id AND q.game_id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'share_key_poll', v_key);
END $$;

-- game_reset_poll_for_edit
CREATE OR REPLACE FUNCTION "public"."game_reset_poll_for_edit"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_game record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type, status into v_game
  from public.games
  where id = p_game_id and owner_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  -- otwartej ankiety nie resetujemy spod ręki głosujących
  if v_game.status = 'poll_open' then
    return jsonb_build_object('ok', false, 'error', 'poll_open');
  end if;
  if v_game.status = 'poll_stopped' then
    return jsonb_build_object('ok', false, 'error', 'poll_stopped');
  end if;

  if v_game.type not in ('poll_text', 'poll_points') then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.games
     set status = 'draft', poll_opened_at = null, poll_closed_at = null
   where id = p_game_id;

  update public.answers a
     set fixed_points = 0
    from public.questions q
   where q.id = a.question_id
     and q.game_id = p_game_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

-- guard_game_content
CREATE OR REPLACE FUNCTION "public"."guard_game_content"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_game_id uuid;
  v_type text;
  v_status text;
begin
  -- tylko zapisy prosto z przeglądarki; SECURITY DEFINER i kaskady -> owner
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'questions' then
    v_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  else
    select q.game_id into v_game_id
    from public.questions q
    where q.id = case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  end if;

  select g.type::text, g.status::text into v_type, v_status
  from public.games g
  where g.id = v_game_id;

  if not found then
    return coalesce(new, old);
  end if;

  if v_type = 'market' then
    raise exception 'game_content_locked:market' using errcode = 'P0001';
  end if;

  if v_type in ('poll_text', 'poll_points') and v_status in ('poll_open', 'poll_stopped') then
    raise exception 'game_content_locked:%', v_status using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

-- assert_game_answers_minmax
CREATE OR REPLACE FUNCTION "public"."assert_game_answers_minmax"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  qn int;
  bad_q int;
  an int;
begin
  -- Walidujemy tylko gdy zmieniasz status na poll_open (start) albo ready (zamykanie)
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status not in ('poll_open'::game_status, 'poll_stopped'::game_status, 'ready'::game_status) then
    return new;
  end if;

  -- gra preparowana nie ma sondażu, więc nie blokuj statusów z tej funkcji
  if new.type = 'prepared'::game_type then
    return new;
  end if;

  -- >= 10 pytań zawsze dla poll_text i poll_points
  select count(*) into qn
  from public.questions
  where game_id = new.id;

  if qn < 10 then
    raise exception 'assert_game_answers_minmax: need >=10 questions (have %)', qn;
  end if;

  -- poll_points: każde pytanie musi mieć 3..6 odpowiedzi (dla startu i zamknięcia)
  if new.type = 'poll_points'::game_type then
    select q.ord into bad_q
    from public.questions q
    where q.game_id = new.id
      and (
        (select count(*) from public.answers a where a.question_id = q.id) < 3
        or
        (select count(*) from public.answers a where a.question_id = q.id) > 6
      )
    order by q.ord
    limit 1;

    if bad_q is not null then
      select count(*) into an
      from public.answers a
      join public.questions q on q.id = a.question_id
      where q.game_id = new.id and q.ord = bad_q;

      raise exception 'assert_game_answers_minmax: question % must have 3..6 answers (have %)', bad_q, an;
    end if;
  end if;

  -- poll_text: tu nie walidujemy liczby odpowiedzi (bo w trakcie to teksty od ludzi),
  -- jedynie >=10 pytań.

  return new;
end $$;

-- polls_hub_list_polls
CREATE OR REPLACE FUNCTION "public"."polls_hub_list_polls"() RETURNS TABLE("game_id" "uuid", "name" "text", "poll_type" "text", "poll_state" "text", "created_at" timestamp with time zone, "tasks_active" integer, "tasks_done" integer, "anon_votes" integer, "close_ready" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return query
  with g as (
    select
      gm.id as game_id,
      gm.name,
      gm.type as poll_type,  -- game_type enum
      case
        when gm.status = 'poll_open' then 'open'
        when gm.status = 'poll_stopped' then 'stopped'
        when gm.status = 'ready' then 'closed'
        else 'draft'
      end as poll_state,
      gm.created_at
    from public.games gm
    where gm.owner_id = auth.uid()
      and gm.type in ('poll_text','poll_points')
  ),
  t as (
    select
      pt.game_id,
      count(*) filter (where pt.done_at is null and pt.declined_at is null and pt.cancelled_at is null)::int as tasks_active,
      count(*) filter (where pt.done_at is not null)::int as tasks_done
    from public.poll_tasks pt
    where pt.owner_id = auth.uid()
    group by pt.game_id
  )
  select
    g.game_id,
    g.name,
    g.poll_type::text as poll_type, -- ✅ zwracamy text
    g.poll_state,
    g.created_at,
    coalesce(t.tasks_active,0) as tasks_active,
    coalesce(t.tasks_done,0) as tasks_done,
    public.polls_hub_anon_voters(g.game_id, g.poll_type::text) as anon_votes, -- ✅ cast
    (g.poll_state = 'open') and public.polls_hub_can_close(g.game_id, g.poll_type::text) as close_ready -- ✅ cast
  from g
  left join t on t.game_id = g.game_id
  order by g.created_at desc;
end;
$$;

-- get_admin_poll_stats
CREATE OR REPLACE FUNCTION "public"."get_admin_poll_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  excluded_ids uuid[];
  result jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  WITH eligible_games AS (
    SELECT g.id, g.owner_id, g.type::text AS type, g.status::text AS status
    FROM public.games g
    WHERE g.type IN ('poll_text', 'poll_points')
      AND g.is_demo = false
      AND g.source_market_id IS NULL
      AND NOT (g.owner_id = ANY(excluded_ids))
  ),
  answer_rows AS (
    SELECT v.game_id, v.poll_session_id, v.voter_token, v.created_at
    FROM public.poll_votes v
    JOIN eligible_games g ON g.id = v.game_id
    UNION ALL
    SELECT e.game_id, e.poll_session_id, e.voter_token, e.created_at
    FROM public.poll_text_entries e
    JOIN eligible_games g ON g.id = e.game_id
  ),
  voters AS (
    SELECT DISTINCT game_id, voter_token FROM answer_rows
  ),
  task_rollup AS (
    SELECT t.game_id, count(*) AS tasks,
           count(*) FILTER (WHERE t.status = 'done') AS completed
    FROM public.poll_tasks t
    JOIN eligible_games g ON g.id = t.game_id
    GROUP BY t.game_id
  ),
  subs AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE s.status = 'active') AS active,
           count(*) FILTER (WHERE s.status = 'pending') AS pending,
           count(*) FILTER (WHERE s.status = 'declined') AS declined,
           count(*) FILTER (WHERE s.status = 'cancelled') AS cancelled
    FROM public.poll_subscriptions s
    WHERE NOT (s.owner_id = ANY(excluded_ids))
  )
  SELECT jsonb_build_object(
    'games', jsonb_build_object(
      'total', (SELECT count(*) FROM eligible_games),
      'text', (SELECT count(*) FROM eligible_games WHERE type = 'poll_text'),
      'points', (SELECT count(*) FROM eligible_games WHERE type = 'poll_points'),
      'open', (SELECT count(*) FROM eligible_games WHERE status = 'poll_open'),
      'stopped', (SELECT count(*) FROM eligible_games WHERE status = 'poll_stopped'),
      'active', (SELECT count(*) FROM eligible_games WHERE status IN ('poll_open', 'poll_stopped')),
      'active_with_votes', (
        SELECT count(*) FROM eligible_games g
        WHERE g.status IN ('poll_open', 'poll_stopped')
          AND EXISTS (
            SELECT 1
            FROM answer_rows a
            JOIN public.poll_sessions s ON s.id = a.poll_session_id
            WHERE a.game_id = g.id AND s.game_id = g.id AND s.is_open
          )
      )
    ),
    'responses', jsonb_build_object(
      'total', (SELECT count(*) FROM answer_rows),
      'last_7d', (SELECT count(*) FROM answer_rows WHERE created_at >= now() - interval '7 days'),
      'voters', (SELECT count(*) FROM voters)
    ),
    'sharing', jsonb_build_object(
      'polls', (SELECT count(DISTINCT game_id) FROM task_rollup),
      'tasks', COALESCE((SELECT sum(tasks) FROM task_rollup), 0),
      'completed_tasks', COALESCE((SELECT sum(completed) FROM task_rollup), 0)
    ),
    'subscriptions', jsonb_build_object(
      'total', (SELECT total FROM subs),
      'active', (SELECT active FROM subs),
      'pending', (SELECT pending FROM subs),
      'declined', (SELECT declined FROM subs),
      'cancelled', (SELECT cancelled FROM subs)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- poll_go_resolve
CREATE OR REPLACE FUNCTION "public"."poll_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  t record;
  u record;
BEGIN
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'poll_stopped' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      UPDATE public.poll_tasks SET opened_at = now() WHERE id = t.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'task',
      'task_id', t.id, 'status', t.status,
      'owner_id', t.owner_id, 'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id, 'game_name', t.game_name,
      'poll_type', t.poll_type, 'share_key_poll', t.share_key_poll
    );
  END IF;

  -- 3) global unsub token?
  SELECT email, suppressed_at INTO u
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF found THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'unsub',
      'already_suppressed', (u.suppressed_at IS NOT NULL)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
END;
$$;

-- poll_task_resolve
CREATE OR REPLACE FUNCTION "public"."poll_task_resolve"("p_token" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  t record;
  u uuid;
  requires_auth boolean := false;
  needs_email boolean := false;
BEGIN
  u := auth.uid();

  SELECT
    pt.id,
    pt.owner_id,
    pt.recipient_user_id,
    pt.recipient_email,
    pt.game_id,
    pt.poll_type,
    pt.share_key_poll,
    pt.status,
    pt.opened_at,
    pt.done_at,
    pt.declined_at,
    pt.cancelled_at,
    g.status::text AS game_status, -- E11b
    g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  WHERE pt.token = p_token
  LIMIT 1;

  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- niedostępne u odbiorcy (declined/cancelled), oraz po wykonaniu
  IF t.status IN ('declined','cancelled') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token');
  END IF;

  IF t.status = 'done' OR t.done_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_done');
  END IF;

  -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
  IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
     OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF t.game_status = 'poll_stopped' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
  END IF;
  IF t.game_status = 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
  END IF;

  -- jeżeli task jest przypisany do user_id: wymagamy zgodności sesji
  IF t.recipient_user_id IS NOT NULL THEN
    IF u IS NULL THEN
      requires_auth := true;
    ELSIF u <> t.recipient_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token');
    END IF;
  END IF;

  -- jeżeli task jest e-mailowy: e-mail może być potrzebny do późniejszego UI/komunikatu
  IF t.recipient_user_id IS NULL AND t.recipient_email IS NULL THEN
    -- przypadek "czysty e-mail": oczekujemy podania e-mail w UI
    IF p_email IS NULL OR btrim(p_email) = '' THEN
      needs_email := true;
    END IF;
  END IF;

  -- mark opened (pierwsze wejście)
  IF t.opened_at IS NULL THEN
    UPDATE public.poll_tasks
      SET opened_at = now() -- E11b: bez stanu pośredniego 'opened'
      WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'kind', 'task',
    'task_id', t.id,
    'game_id', t.game_id,
    'poll_type', t.poll_type,
    'key', t.share_key_poll,
    'voter_token', public.poll_task_voter_token(t.id),
    'requires_auth', requires_auth,
    'needs_email', needs_email,
    'recipient_email', COALESCE(t.recipient_email, NULLIF(btrim(p_email), ''))
  );
END;
$$;

-- poll_text_submit_batch_owner
CREATE OR REPLACE FUNCTION "public"."poll_text_submit_batch_owner"("p_game_id" "uuid", "p_items" "jsonb", "p_voter_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- 315: tylko otwarta ankieta (zatrzymana nie przyjmuje wpisów)
  if (select status from games where id=p_game_id) <> 'poll_open' then
    raise exception 'Game not open';
  end if;

  insert into poll_text_entries (
    game_id,
    poll_session_id,
    question_id,
    voter_token,
    answer_raw,
    answer_norm
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    p_voter_token,
    coalesce(x->>'answer_raw',''),
    coalesce(x->>'answer_norm','')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  return true;
end;
$$;

-- poll_points_vote_batch_owner
CREATE OR REPLACE FUNCTION "public"."poll_points_vote_batch_owner"("p_game_id" "uuid", "p_items" "jsonb", "p_voter_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- 315: tylko otwarta ankieta (zatrzymana nie przyjmuje głosów)
  if (select status from games where id=p_game_id) <> 'poll_open' then
    raise exception 'Game not open';
  end if;

  insert into poll_votes (
    game_id,
    poll_session_id,
    question_id,
    answer_id,
    voter_token,
    question_ord,
    answer_ord
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    (x->>'answer_id')::uuid,
    p_voter_token,
    coalesce((x->>'question_ord')::int, 1),
    coalesce((x->>'answer_ord')::int, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  return true;
end;
$$;

-- _poll_points_normalize
CREATE OR REPLACE FUNCTION "public"."_poll_points_normalize"("p_game_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- policz głosy z ostatniej sesji per pytanie i ustaw fixed_points w answers
  with last_sess as (
    select distinct on (ps.question_id)
      ps.question_id, ps.id as poll_session_id
    from public.poll_sessions ps
    where ps.game_id = p_game_id
    order by ps.question_id, ps.created_at desc
  ),
  a as (
    select q.id as question_id, an.id as answer_id, an.ord as aord
    from public.questions q
    join public.answers an on an.question_id = q.id
    where q.game_id = p_game_id
  ),
  c as (
    select
      a.question_id,
      a.answer_id,
      a.aord,
      coalesce(count(v.id), 0)::int as cnt
    from a
    left join last_sess ls on ls.question_id = a.question_id
    left join public.poll_votes v
      on v.poll_session_id = ls.poll_session_id
     and v.answer_id = a.answer_id
    group by a.question_id, a.answer_id, a.aord
  ),
  c_fixed as (
    select question_id, answer_id, aord,
      case when cnt = 0 then 1 else cnt end as cnt1
    from c
  ),
  tot as (
    select question_id, sum(cnt1)::int as total
    from c_fixed
    group by question_id
  ),
  raw as (
    select
      cf.question_id,
      cf.answer_id,
      cf.aord,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) as raw_p,
      floor(100.0 * cf.cnt1 / nullif(t.total, 0))::int as base_floor,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) - floor(100.0 * cf.cnt1 / nullif(t.total, 0)) as frac
    from c_fixed cf
    join tot t on t.question_id = cf.question_id
  ),
  base as (
    select question_id, answer_id, aord,
      greatest(1, base_floor) as p0,
      frac
    from raw
  ),
  sum_base as (
    select question_id, sum(p0)::int as s0
    from base
    group by question_id
  ),
  need as (
    select b.*, (100 - sb.s0)::int as diff
    from base b
    join sum_base sb on sb.question_id = b.question_id
  ),
  ranked_plus as (
    select n.*,
      row_number() over (partition by question_id order by frac desc, aord asc) as rn_plus
    from need n
  ),
  ranked_minus as (
    select n.*,
      row_number() over (partition by question_id order by p0 desc, frac asc, aord desc) as rn_minus
    from need n
    where p0 > 1
  ),
  final as (
    select
      n.question_id,
      n.answer_id,
      case
        when n.diff > 0 then n.p0 + case when rp.rn_plus <= n.diff then 1 else 0 end
        when n.diff < 0 then n.p0 - case when rm.rn_minus is not null and rm.rn_minus <= abs(n.diff) then 1 else 0 end
        else n.p0
      end as p_final
    from need n
    left join ranked_plus rp on rp.question_id = n.question_id and rp.answer_id = n.answer_id
    left join ranked_minus rm on rm.question_id = n.question_id and rm.answer_id = n.answer_id
  )
  update public.answers aup
  set fixed_points = f.p_final
  from final f
  where aup.id = f.answer_id;
end;
$$;

-- _poll_points_close_unchecked
CREATE OR REPLACE FUNCTION "public"."_poll_points_close_unchecked"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g record;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id and share_key_poll = p_key;

  if not found then raise exception 'bad key or game'; end if;
  if g.type <> 'poll_points' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll is not open'; end if;

  -- 315: normalizacja (0 głosów liczone jako 1, suma 100, min 1) we wspólnej funkcji
  perform public._poll_points_normalize(p_game_id);

  update public.poll_sessions
  set is_open = false, closed_at = now()
  where game_id = p_game_id and is_open = true;

  -- E11b: po zamknięciu kod QR ankiety przestaje działać
  delete from public.device_connect_codes where game_id = p_game_id and device_type = 'poll_qr';

  update public.games
  set status = 'ready', poll_closed_at = now()
  where id = p_game_id;
end;
$$;

-- ============================================================
-- 3. Wspólne funkcje wewnętrzne (bez uprawnień dla klientów)
-- ============================================================

-- Kończy podliczanie: zamyka sesje, kasuje kod QR i czekające zaproszenia, szkic,
-- ustawia status ready i ROTUJE klucz ankiety (stare linki / QR / kody wygasają).
-- Stary klucz zostaje w poll_ended_key, żeby strona głosowania mogła powiedzieć
-- „Ankieta zakończona” zamiast „Ten link wygasł”.
CREATE OR REPLACE FUNCTION public._poll_finish_tally(p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.poll_sessions
     SET is_open = false, closed_at = now()
   WHERE game_id = p_game_id AND is_open = true;

  DELETE FROM public.device_connect_codes WHERE game_id = p_game_id AND device_type = 'poll_qr';

  -- czekające zaproszenia kończą się razem z ankietą (zrobione / odrzucone zostają jako historia)
  DELETE FROM public.poll_tasks WHERE game_id = p_game_id AND status IN ('pending', 'opened');

  DELETE FROM public.poll_tally_drafts WHERE game_id = p_game_id;

  UPDATE public.games
     SET status = 'ready',
         poll_closed_at = now(),
         poll_ended_key = share_key_poll,
         share_key_poll = public.gen_share_key(18),
         updated_at = now()
   WHERE id = p_game_id;
END $$;

-- Ankieta tekstowa: zmergowane odpowiedzi pytania [{text,count}] -> [(ord,text,points)].
-- Port normalizeTo100Int / normalizeCountsTo100 / clip17Final z web/polls/js/polls.js:
--  * tekst: przycięty (trim) do 17 znaków, puste i count <= 0 odpadają, duplikaty
--    (bez względu na wielkość liter, po przycięciu) sumowane;
--  * punkty: metoda największych reszt do sumy 100;
--  * zostają odpowiedzi z >= 3 pkt, najwyżej 6, od największych;
--  * remisy punktów rozbijane w dół (p--), by żadne dwie odpowiedzi nie miały tych samych
--    punktów (suma może wtedy być nieco mniejsza od 100 — jak dotąd w kliencie).
CREATE OR REPLACE FUNCTION public._poll_text_tally_points(p_answers jsonb)
RETURNS TABLE(ord integer, atext text, points integer)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  r record;
  v_used integer[] := ARRAY[]::integer[];
  v_p integer;
  v_n integer := 0;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  FOR r IN
    WITH c AS (
      SELECT min(s.idx) AS idx,
             (array_agg(s.txt ORDER BY s.idx))[1] AS txt,
             sum(s.cnt)::bigint AS cnt
      FROM (
        SELECT x.i::integer AS idx,
               left(btrim(coalesce(x.v->>'text', '')), 17) AS txt,
               CASE WHEN jsonb_typeof(x.v->'count') = 'number'
                    THEN greatest(0, floor((x.v->>'count')::numeric))::bigint ELSE 0 END AS cnt
        FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS x(v, i)
      ) s
      WHERE s.txt <> '' AND s.cnt > 0
      GROUP BY lower(s.txt)
    ),
    f AS (
      SELECT c.idx, c.txt,
             ((100 * c.cnt) / t.total)::integer AS fl,
             (100 * c.cnt) % t.total AS rem
      FROM c CROSS JOIN (SELECT sum(cnt) AS total FROM c) t
    ),
    d AS (
      SELECT f.*, 100 - sum(f.fl) OVER () AS diff,
             row_number() OVER (ORDER BY f.rem DESC, f.idx) AS fidx
      FROM f
    )
    SELECT d.txt, d.fl + CASE WHEN d.fidx <= d.diff THEN 1 ELSE 0 END AS pts, d.fidx
    FROM d
    WHERE d.fl + CASE WHEN d.fidx <= d.diff THEN 1 ELSE 0 END >= 3
    ORDER BY 2 DESC, d.fidx
    LIMIT 6
  LOOP
    v_p := r.pts;
    WHILE v_p > 0 AND v_p = ANY(v_used) LOOP
      v_p := v_p - 1;
    END LOOP;
    v_used := v_used || v_p;
    v_n := v_n + 1;
    ord := v_n; atext := r.txt; points := v_p;
    RETURN NEXT;
  END LOOP;
END $$;

-- ============================================================
-- 4. RPC dla właściciela: Zatrzymaj / Wznów / Podlicz
-- ============================================================

-- poll_open -> poll_stopped. Klucz i zaproszenia bez zmian, głosy zachowane.
-- Zwraca {ok, changed, status}. Ponowne wywołanie na zatrzymanej: ok, changed=false.
CREATE OR REPLACE FUNCTION public.poll_stop(p_game_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status = 'poll_stopped' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', 'poll_stopped');
  END IF;
  IF v_status <> 'poll_open' THEN
    RAISE EXCEPTION 'poll_not_open';
  END IF;

  UPDATE public.games SET status = 'poll_stopped', updated_at = now() WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', 'poll_stopped');
END $$;

-- poll_stopped -> poll_open. Ten sam klucz, głosy zachowane (szkic podliczania też).
CREATE OR REPLACE FUNCTION public.poll_resume(p_game_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status = 'poll_open' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', 'poll_open');
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;

  UPDATE public.games SET status = 'poll_open', updated_at = now() WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', 'poll_open');
END $$;

-- Punktacja: poll_stopped -> ready. Normalizacja jak przy dotychczasowym zamknięciu
-- (0 głosów liczone jako 1, suma 100, min 1). Wymaga minimum odpowiedzi
-- (game_poll_close_check: >= 3 odpowiedzi z >= 3 pkt w pytaniu), inaczej
-- wyjątek 'poll_close_blocked:<kod>:<nr pytania>' (jak guard przy zamykaniu).
-- Potem linki wygasają (klucz rotowany).
CREATE OR REPLACE FUNCTION public.poll_points_tally(p_game_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  v_chk jsonb;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type <> 'poll_points' THEN
    RAISE EXCEPTION 'wrong_type';
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;

  v_chk := public.game_poll_close_check(p_game_id);
  IF NOT coalesce((v_chk->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'poll_close_blocked:%:%', coalesce(v_chk->>'code', 'unknownType'),
      coalesce(v_chk->'params'->>'ord', '')
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._poll_points_normalize(p_game_id);
  PERFORM public._poll_finish_tally(p_game_id);

  RETURN jsonb_build_object('ok', true, 'status', 'ready');
END $$;

-- Ankieta tekstowa: zapis szkicu scalania (dowolny jsonb od klienta, do ~512 KB).
-- p_draft = null kasuje szkic. Tylko dla zatrzymanej ankiety tekstowej.
CREATE OR REPLACE FUNCTION public.poll_text_tally_draft_save(p_game_id uuid, p_draft jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  v_at timestamptz := now();
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type <> 'poll_text' THEN
    RAISE EXCEPTION 'wrong_type';
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;

  IF p_draft IS NULL OR p_draft = 'null'::jsonb THEN
    DELETE FROM public.poll_tally_drafts WHERE game_id = p_game_id;
    RETURN jsonb_build_object('ok', true, 'saved_at', NULL);
  END IF;
  IF octet_length(p_draft::text) > 524288 THEN
    RAISE EXCEPTION 'draft_too_large';
  END IF;

  INSERT INTO public.poll_tally_drafts (game_id, draft, updated_at)
  VALUES (p_game_id, p_draft, v_at)
  ON CONFLICT (game_id) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at;

  RETURN jsonb_build_object('ok', true, 'saved_at', v_at);
END $$;

-- Odczyt szkicu: {draft: <jsonb|null>, saved_at}. Poza stanem zatrzymania zawsze draft = null.
CREATE OR REPLACE FUNCTION public.poll_text_tally_draft_get(p_game_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  d record;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.status::text INTO v_status FROM public.games g WHERE g.id = p_game_id;
  IF v_status <> 'poll_stopped' THEN
    RETURN jsonb_build_object('draft', NULL, 'saved_at', NULL);
  END IF;

  SELECT t.draft, t.updated_at INTO d FROM public.poll_tally_drafts t WHERE t.game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('draft', NULL, 'saved_at', NULL);
  END IF;
  RETURN jsonb_build_object('draft', d.draft, 'saved_at', d.updated_at);
END $$;

-- Ankieta tekstowa: poll_stopped -> ready. p_payload:
--   { "items": [ { "question_id": "...", "answers": [ { "text": "...", "count": 12 }, ... ] }, ... ] }
-- (odpowiedzi już zmergowane przez właściciela). Serwer liczy punkty (suma ~100 na pytanie,
-- patrz _poll_text_tally_points), zapisuje answers jak poll_text_close_apply, wymaga
-- >= 3 odpowiedzi (>= 3 pkt) w KAŻDYM pytaniu gry — inaczej wyjątek
-- 'poll_close_blocked:closeMinText:<nr pytania>'. Potem linki wygasają.
CREATE OR REPLACE FUNCTION public.poll_text_tally_apply(p_game_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  q record;
  item jsonb;
  v_all jsonb := '{}'::jsonb;
  v_ans jsonb;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type <> 'poll_text' THEN
    RAISE EXCEPTION 'wrong_type';
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  -- najpierw policz i zwaliduj wszystkie pytania, dopiero potem zapisuj
  FOR q IN SELECT id, ord FROM public.questions WHERE game_id = p_game_id ORDER BY ord LOOP
    SELECT i INTO item
    FROM jsonb_array_elements(p_payload->'items') AS i
    WHERE i->>'question_id' = q.id::text
    LIMIT 1;

    SELECT coalesce(jsonb_agg(jsonb_build_object('text', c.atext, 'points', c.points) ORDER BY c.ord), '[]'::jsonb)
      INTO v_ans
    FROM public._poll_text_tally_points(item->'answers') c;

    IF item IS NULL OR jsonb_array_length(v_ans) < 3 THEN
      RAISE EXCEPTION 'poll_close_blocked:closeMinText:%', q.ord USING ERRCODE = 'P0001';
    END IF;

    v_all := v_all || jsonb_build_object(q.id::text, v_ans);
  END LOOP;

  FOR q IN SELECT id FROM public.questions WHERE game_id = p_game_id LOOP
    DELETE FROM public.answers WHERE question_id = q.id;
    INSERT INTO public.answers (question_id, ord, text, fixed_points)
    SELECT q.id, a.i, a.x->>'text', (a.x->>'points')::int
    FROM jsonb_array_elements(v_all->(q.id::text)) WITH ORDINALITY AS a(x, i);
  END LOOP;

  PERFORM public._poll_finish_tally(p_game_id);

  RETURN jsonb_build_object('ok', true, 'status', 'ready');
END $$;

-- ============================================================
-- 5. Odczyty: stan ankiety dla stron głosowania i liczniki dla listy gier
-- ============================================================

-- Dla stron głosowania (anon): stan ankiety względem klucza z linku.
-- state: 'draft' (klucz aktualny, ankieta jeszcze nie uruchomiona) · 'open' · 'stopped'
--        · 'ended' (zakończona; także stary link tej ankiety po podliczeniu)
--        · 'expired' (link z wcześniejszego uruchomienia / przerwanej) · 'not_found'.
CREATE OR REPLACE FUNCTION public.poll_state(p_game_id uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  g record;
  v_state text;
BEGIN
  SELECT id, type::text AS type, status::text AS status, share_key_poll, poll_ended_key
    INTO g
  FROM public.games WHERE id = p_game_id;

  IF NOT FOUND OR g.type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', true, 'state', 'not_found');
  END IF;

  IF p_key IS NOT NULL AND g.share_key_poll = p_key THEN
    v_state := CASE g.status
      WHEN 'poll_open' THEN 'open'
      WHEN 'poll_stopped' THEN 'stopped'
      WHEN 'ready' THEN 'ended'
      ELSE 'draft'
    END;
  ELSIF p_key IS NOT NULL AND g.poll_ended_key IS NOT NULL AND g.poll_ended_key = p_key AND g.status = 'ready' THEN
    v_state := 'ended';
  ELSE
    v_state := 'expired';
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'type', g.type);
END $$;

-- Dla listy gier (plakietki): zatrzymane i otwarte ankiety właściciela z liczbą
-- głosujących (różne voter_token w całej ankiecie).
CREATE OR REPLACE FUNCTION public.polls_vote_counts() RETURNS TABLE(game_id uuid, status text, votes integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT g.id, g.status::text,
         CASE g.type
           WHEN 'poll_points' THEN
             (SELECT count(DISTINCT v.voter_token)::integer FROM public.poll_votes v WHERE v.game_id = g.id)
           ELSE
             (SELECT count(DISTINCT e.voter_token)::integer FROM public.poll_text_entries e WHERE e.game_id = g.id)
         END
  FROM public.games g
  WHERE g.owner_id = auth.uid()
    AND g.type IN ('poll_text', 'poll_points')
    AND g.status IN ('poll_open', 'poll_stopped');
$$;

-- ============================================================
-- 6. Uprawnienia
-- ============================================================

REVOKE ALL ON FUNCTION public._poll_finish_tally(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._poll_points_normalize(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._poll_text_tally_points(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.games_poll_state_reset() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.poll_stop(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_resume(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_points_tally(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_text_tally_draft_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_text_tally_draft_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_text_tally_apply(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.polls_vote_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_stop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_resume(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_points_tally(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_text_tally_draft_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_text_tally_draft_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_text_tally_apply(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.polls_vote_counts() TO authenticated;

REVOKE ALL ON FUNCTION public.poll_state(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_state(uuid, text) TO anon, authenticated;

COMMIT;
