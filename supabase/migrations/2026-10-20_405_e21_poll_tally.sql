-- 405: E21 — podliczanie ankiet (docs/reguly-gier-transfer-plan.md §3, §4).
-- Wspólny algorytm z web/shared/js/core/poll-tally-math.js:
--  * N = liczba pełnych ankiet bieżącego uruchomienia (głosujący z odpowiedzią
--    na każde pytanie w najnowszej sesji pytania); liczą się tylko ich głosy.
--  * udział = 0 bez głosów, dodatni <1% -> 1%, poza tym floor(100*głosy/N);
--    kwalifikacja od 4%; punkty odpowiedzi = jej udział (bez rozdzielania reszt
--    i bez obniżania remisów), suma ≤100.
--  * wejście w podliczanie od 10 pełnych ankiet (game_poll_close_check);
--    zatwierdzenie dodatkowo: ≥3 kwalifikujące odpowiedzi na pytanie.
--  * tekstowa: wpisy oczyszczone czcionką (fam_answer_clean) przed grupowaniem
--    (klucz: wielkie litery); ranking liczba głosów malejąco, potem kolejność
--    wejścia; szóstka z kwalifikujących; remis na granicy -- wybór użytkownika
--    (selected), walidowany tutaj.
--  * bezpośrednia zmiana statusu na ready z przeglądarki zablokowana; nieużywane
--    starsze punkty wejścia głosów/zamykania wycofane z ról przeglądarki.

CREATE OR REPLACE FUNCTION public._poll_share(p_votes bigint, p_n bigint) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT CASE WHEN coalesce(p_votes, 0) <= 0 OR coalesce(p_n, 0) <= 0 THEN 0
              ELSE greatest(1, ((100 * p_votes) / p_n)::int) END
$f$;

-- Najnowsza sesja każdego pytania gry = bieżące uruchomienie ankiety.
CREATE OR REPLACE FUNCTION public._poll_latest_sessions(p_game_id uuid)
RETURNS TABLE(question_id uuid, poll_session_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT DISTINCT ON (ps.question_id) ps.question_id, ps.id
  FROM public.poll_sessions ps
  JOIN public.questions q ON q.id = ps.question_id AND q.game_id = p_game_id
  WHERE ps.game_id = p_game_id
  ORDER BY ps.question_id, ps.created_at DESC, ps.id DESC
$f$;

-- Głosujący z odpowiedzią na każde pytanie w bieżącym uruchomieniu.
CREATE OR REPLACE FUNCTION public._poll_full_voters(p_game_id uuid)
RETURNS TABLE(voter_token text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH ls AS (SELECT * FROM public._poll_latest_sessions(p_game_id)),
  qn AS (SELECT count(*) AS n FROM public.questions WHERE game_id = p_game_id),
  hits AS (
    SELECT v.voter_token, v.question_id
    FROM public.poll_votes v JOIN ls ON ls.poll_session_id = v.poll_session_id AND ls.question_id = v.question_id
    WHERE v.game_id = p_game_id AND v.answer_id IS NOT NULL
    UNION
    SELECT e.voter_token, e.question_id
    FROM public.poll_text_entries e JOIN ls ON ls.poll_session_id = e.poll_session_id AND ls.question_id = e.question_id
    WHERE e.game_id = p_game_id
  )
  SELECT h.voter_token FROM hits h
  GROUP BY h.voter_token
  HAVING count(DISTINCT h.question_id) = (SELECT n FROM qn) AND (SELECT n FROM qn) > 0
$f$;

CREATE OR REPLACE FUNCTION public._poll_full_submissions(p_game_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT count(*)::int FROM public._poll_full_voters(p_game_id)
$f$;

REVOKE ALL ON FUNCTION public._poll_latest_sessions(uuid), public._poll_full_voters(uuid),
  public._poll_full_submissions(uuid) FROM PUBLIC, anon, authenticated;

-- Wejście w podliczanie (przycisk „Podlicz”): ankieta otwarta/zatrzymana i
-- ≥10 pełnych ankiet. Kwalifikację odpowiedzi sprawdza dopiero zatwierdzenie.
CREATE OR REPLACE FUNCTION public.game_poll_close_check(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  c_min constant int := 10;
  g record;
  v_n int;
begin
  select id, type::text as type, status::text as status into g
  from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'noGame');
  end if;
  if g.type not in ('poll_text', 'poll_points') then
    return jsonb_build_object('ok', false, 'code', 'preparedNoPoll');
  end if;
  if g.status not in ('poll_open', 'poll_stopped') then
    return jsonb_build_object('ok', false, 'code', 'closeOnlyOpen');
  end if;
  v_n := public._poll_full_submissions(p_game_id);
  if v_n < c_min then
    return jsonb_build_object('ok', false, 'code', 'tallyMinVotes', 'params', jsonb_build_object('min', c_min, 'n', v_n));
  end if;
  return jsonb_build_object('ok', true, 'params', jsonb_build_object('min', c_min, 'n', v_n));
end;
$$;

-- Dane do podliczania (właściciel, ankieta zatrzymana): N oraz głosy pełnych
-- ankiet -- punktowa: liczba głosów odpowiedzi; tekstowa: oczyszczone teksty
-- z liczbą wpisów (puste po oczyszczeniu tylko jako licznik dropped).
CREATE OR REPLACE FUNCTION public.poll_tally_source(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  g record;
  v_n int;
  v_questions jsonb;
begin
  perform public._poll_assert_owner(p_game_id);
  select id, type::text as type, status::text as status into g from public.games where id = p_game_id;
  if g.type not in ('poll_text', 'poll_points') then
    raise exception 'wrong_type';
  end if;
  if g.status <> 'poll_stopped' then
    raise exception 'poll_not_stopped';
  end if;
  v_n := public._poll_full_submissions(p_game_id);

  if g.type = 'poll_points' then
    select coalesce(jsonb_agg(jsonb_build_object('question_id', q.id, 'ord', q.ord, 'answers', (
        select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'ord', a.ord, 'votes', (
            select count(*) from public.poll_votes v
            join public._poll_latest_sessions(p_game_id) ls on ls.poll_session_id = v.poll_session_id and ls.question_id = v.question_id
            where v.answer_id = a.id and v.voter_token in (select voter_token from public._poll_full_voters(p_game_id))
          )) order by a.ord), '[]'::jsonb)
        from public.answers a where a.question_id = q.id)) order by q.ord), '[]'::jsonb)
      into v_questions
    from public.questions q where q.game_id = p_game_id;
  else
    with ls as (select * from public._poll_latest_sessions(p_game_id)),
    fv as (select voter_token from public._poll_full_voters(p_game_id)),
    e as (
      select e.question_id, public.fam_answer_clean(e.answer_norm) as txt, e.created_at, e.id
      from public.poll_text_entries e
      join ls on ls.poll_session_id = e.poll_session_id and ls.question_id = e.question_id
      where e.game_id = p_game_id and e.voter_token in (select voter_token from fv)
    ),
    grp as (
      select question_id, upper(txt) as k, (array_agg(txt order by created_at, id))[1] as txt,
             count(*) as cnt, min(created_at) as first_at
      from e where txt <> '' group by question_id, upper(txt)
    )
    select coalesce(jsonb_agg(jsonb_build_object('question_id', q.id, 'ord', q.ord,
        'dropped', (select count(*) from e where e.question_id = q.id and e.txt = ''),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('text', grp.txt, 'count', grp.cnt)
                    order by grp.cnt desc, grp.first_at), '[]'::jsonb)
                  from grp where grp.question_id = q.id)) order by q.ord), '[]'::jsonb)
      into v_questions
    from public.questions q where q.game_id = p_game_id;
  end if;

  return jsonb_build_object('n', v_n, 'min', 10, 'questions', v_questions);
end;
$$;
REVOKE ALL ON FUNCTION public.poll_tally_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_tally_source(uuid) TO authenticated;

-- Punktowa: udział pełnych ankiet; poniżej 4% -- 0 pkt (odpowiedź zostaje, nie gra).
CREATE OR REPLACE FUNCTION public._poll_points_normalize(p_game_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_n int := public._poll_full_submissions(p_game_id);
begin
  with fv as (select voter_token from public._poll_full_voters(p_game_id)),
  ls as (select * from public._poll_latest_sessions(p_game_id)),
  counts as (
    select a.id as answer_id,
      (select count(*) from public.poll_votes v
        join ls on ls.poll_session_id = v.poll_session_id and ls.question_id = v.question_id
        where v.answer_id = a.id and v.voter_token in (select voter_token from fv)) as votes
    from public.answers a join public.questions q on q.id = a.question_id
    where q.game_id = p_game_id
  )
  update public.answers a
     set fixed_points = case when public._poll_share(c.votes, v_n) >= 4 then public._poll_share(c.votes, v_n) else 0 end
    from counts c
   where a.id = c.answer_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.poll_points_tally(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_type text;
  v_status text;
  v_chk jsonb;
  v_bad int;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;
  IF v_type <> 'poll_points' THEN RAISE EXCEPTION 'wrong_type'; END IF;
  IF v_status <> 'poll_stopped' THEN RAISE EXCEPTION 'poll_not_stopped'; END IF;

  -- ponownie próg 10 pełnych ankiet (starszy klient / usunięte głosy)
  v_chk := public.game_poll_close_check(p_game_id);
  IF NOT coalesce((v_chk->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'poll_close_blocked:%:%', coalesce(v_chk->>'code', 'unknownType'),
      coalesce(v_chk->'params'->>'n', '') USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._poll_points_normalize(p_game_id);

  SELECT q.ord INTO v_bad
  FROM public.questions q
  WHERE q.game_id = p_game_id
    AND (SELECT count(*) FROM public.answers a WHERE a.question_id = q.id AND a.fixed_points >= 4) < 3
  ORDER BY q.ord LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'poll_close_blocked:closeMinPoints:%', v_bad USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._poll_finish_tally(p_game_id);
  RETURN jsonb_build_object('ok', true, 'status', 'ready');
END $$;

-- Tekstowa: wybrane odpowiedzi pytania. p_answers: [{text, count}] po scaleniach
-- użytkownika; p_selected: teksty wybrane z remisu na granicy szóstki (opcjonalnie).
-- Błędny wybór -> wyjątek 'tally_selection'.
CREATE OR REPLACE FUNCTION public._poll_text_tally_select(p_answers jsonb, p_selected jsonb, p_n integer)
RETURNS TABLE(ord integer, atext text, points integer)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_q jsonb := '[]'::jsonb;   -- kwalifikujące, w kolejności rankingu
  v_qn int;
  v_cut int;                  -- liczba głosów szóstej
  v_above int;
  v_slots int;
  v_tie int;
  v_sel text[];
  v_keys text[];
  r record;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN RETURN; END IF;

  FOR r IN
    WITH src AS (
      SELECT x.i::int AS idx, public.fam_answer_clean(x.v->>'text') AS txt,
        CASE WHEN jsonb_typeof(x.v->'count') = 'number'
          THEN greatest(0, floor((x.v->>'count')::numeric))::bigint ELSE 0 END AS cnt
      FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS x(v, i)
    ), grouped AS (
      SELECT min(idx) AS idx, upper(txt) AS k, (array_agg(txt ORDER BY idx))[1] AS txt, sum(cnt)::bigint AS cnt
      FROM src WHERE txt <> '' AND cnt > 0 GROUP BY upper(txt)
    )
    SELECT g.k, g.txt, g.cnt, public._poll_share(g.cnt, p_n) AS pct
    FROM grouped g
    WHERE public._poll_share(g.cnt, p_n) >= 4
    ORDER BY g.cnt DESC, g.idx
  LOOP
    v_q := v_q || jsonb_build_array(jsonb_build_object('k', r.k, 'txt', r.txt, 'cnt', r.cnt, 'pct', r.pct));
  END LOOP;

  v_qn := jsonb_array_length(v_q);
  IF v_qn <= 6 THEN
    v_keys := ARRAY(SELECT e->>'k' FROM jsonb_array_elements(v_q) e);
  ELSE
    v_cut := (v_q->5->>'cnt')::int;
    SELECT count(*) FILTER (WHERE (e->>'cnt')::int > v_cut), count(*) FILTER (WHERE (e->>'cnt')::int = v_cut)
      INTO v_above, v_tie FROM jsonb_array_elements(v_q) e;
    v_slots := 6 - v_above;
    v_keys := ARRAY(SELECT e->>'k' FROM jsonb_array_elements(v_q) e WHERE (e->>'cnt')::int > v_cut);
    IF jsonb_typeof(p_selected) = 'array' AND v_tie > v_slots THEN
      v_sel := ARRAY(SELECT DISTINCT upper(public.fam_answer_clean(s)) FROM jsonb_array_elements_text(p_selected) s);
      -- dokładnie wszystkie ponad remisem + v_slots z grupy remisowej, nic więcej
      IF cardinality(v_sel) <> 6
         OR NOT (v_keys <@ v_sel)
         OR EXISTS (SELECT 1 FROM unnest(v_sel) s WHERE s <> ALL (v_keys)
                     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_q) e WHERE e->>'k' = s AND (e->>'cnt')::int = v_cut)) THEN
        RAISE EXCEPTION 'tally_selection';
      END IF;
      v_keys := v_sel;
    ELSE
      -- domyślnie: pierwsze z grupy remisowej w kolejności rankingu
      v_keys := v_keys || ARRAY(SELECT e->>'k' FROM jsonb_array_elements(v_q) WITH ORDINALITY AS t(e, i)
                                WHERE (e->>'cnt')::int = v_cut ORDER BY i LIMIT v_slots);
    END IF;
  END IF;

  ord := 0;
  FOR r IN SELECT e->>'txt' AS txt, (e->>'pct')::int AS pct FROM jsonb_array_elements(v_q) WITH ORDINALITY AS t(e, i)
           WHERE e->>'k' = ANY (v_keys) ORDER BY i LOOP
    ord := ord + 1;
    atext := r.txt;
    points := r.pct;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._poll_text_tally_select(jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.poll_text_tally_apply(p_game_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_type text;
  v_status text;
  v_chk jsonb;
  v_n int;
  q record;
  item jsonb;
  v_all jsonb := '{}'::jsonb;
  v_ans jsonb;
  v_sum bigint;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;
  IF v_type <> 'poll_text' THEN RAISE EXCEPTION 'wrong_type'; END IF;
  IF v_status <> 'poll_stopped' THEN RAISE EXCEPTION 'poll_not_stopped'; END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_payload'; END IF;

  v_chk := public.game_poll_close_check(p_game_id);
  IF NOT coalesce((v_chk->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'poll_close_blocked:%:%', coalesce(v_chk->>'code', 'unknownType'),
      coalesce(v_chk->'params'->>'n', '') USING ERRCODE = 'P0001';
  END IF;
  v_n := (v_chk->'params'->>'n')::int;

  -- najpierw policz i zwaliduj wszystkie pytania, dopiero potem zapisuj
  FOR q IN SELECT id, ord FROM public.questions WHERE game_id = p_game_id ORDER BY ord LOOP
    SELECT i INTO item FROM jsonb_array_elements(p_payload->'items') AS i
    WHERE i->>'question_id' = q.id::text LIMIT 1;

    -- liczby głosów z klienta nie mogą przekroczyć pełnych ankiet (nieaktualny podgląd)
    SELECT coalesce(sum(CASE WHEN jsonb_typeof(a->'count') = 'number' THEN greatest(0, floor((a->>'count')::numeric)) ELSE 0 END), 0)
      INTO v_sum FROM jsonb_array_elements(CASE WHEN jsonb_typeof(item->'answers') = 'array' THEN item->'answers' ELSE '[]' END) a;
    IF v_sum > v_n THEN
      RAISE EXCEPTION 'poll_close_blocked:tallyStale:%', q.ord USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      SELECT coalesce(jsonb_agg(jsonb_build_object('text', c.atext, 'points', c.points) ORDER BY c.ord), '[]'::jsonb)
        INTO v_ans
      FROM public._poll_text_tally_select(item->'answers', item->'selected', v_n) c;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM = 'tally_selection' THEN
        RAISE EXCEPTION 'poll_close_blocked:tallySelection:%', q.ord USING ERRCODE = 'P0001';
      END IF;
      RAISE;
    END;

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

-- Zamknięcie ankiety tylko przez RPC podliczania (z ich walidacją). Bez
-- SECURITY DEFINER: current_user ma być rolą wołającego (przeglądarka vs RPC).
CREATE OR REPLACE FUNCTION public.guard_game_poll_close() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
begin
  if new.status = 'ready' and old.status in ('poll_open', 'poll_stopped')
     and new.type in ('poll_text', 'poll_points')
     and current_user in ('authenticated', 'anon') then
    raise exception 'poll_close_blocked:useTally:' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Tekst głosu: najwyżej 17 znaków, niepusty -- także w bezpośrednim wywołaniu.
CREATE OR REPLACE FUNCTION public.poll_text_submit(p_game_id uuid, p_key text, p_question_id uuid, p_voter_token text, p_answer_raw text, p_answer_norm text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  g public.games%rowtype;
  s_id uuid;
  v_raw text := btrim(coalesce(p_answer_raw, ''));
begin
  perform public._poll_assert_voter(p_game_id, p_key, p_voter_token);
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if g.share_key_poll <> p_key then raise exception 'Invalid poll key'; end if;
  if g.type <> 'poll_text'::game_type then raise exception 'Wrong game type'; end if;
  if g.status <> 'poll_open'::game_status then raise exception 'Poll is not open'; end if;
  if char_length(v_raw) not between 1 and 17 then raise exception 'invalid_answer'; end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id and ps.question_id = p_question_id and ps.is_open = true
  order by ps.created_at desc limit 1;
  if s_id is null then raise exception 'No open session'; end if;

  insert into public.poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
  values (p_game_id, s_id, p_question_id, p_voter_token, v_raw,
          lower(regexp_replace(coalesce(nullif(btrim(p_answer_norm), ''), v_raw), '\s+', ' ', 'g')));
end;
$$;

-- Starsze punkty wejścia bez kontraktu pełnej ankiety / zamknięcia: nieużywane
-- przez aplikację; pozostają tylko do wywołań wewnętrznych (SECURITY DEFINER).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.poll_close_and_normalize(uuid,text)',
    'public.poll_text_submit(uuid,text,uuid,text,text,text)',
    'public.poll_text_submit_simple_legacy(uuid,text,uuid,text,text)',
    'public.poll_text_submit_batch_owner(uuid,jsonb,text)',
    'public.poll_points_vote(uuid,text,uuid,uuid,text)',
    'public.poll_points_vote_batch_owner(uuid,jsonb,text)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END IF;
  END LOOP;
END $$;
