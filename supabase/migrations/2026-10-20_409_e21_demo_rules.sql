-- 409: E21 — gry demo zgodne z regułami swoich typów (decyzja użytkownika
-- 2026-10-20: „Demo gry trzeba poprawić, żeby odpowiadały swoim typom”,
-- nieedytowane kopie demo poprawić migracją u wszystkich).
-- Odczyt 408: preparowana ma w każdym języku 4 odpowiedzi poniżej 4 pkt;
-- otwarta ankieta punktowa ma 8 pełnych ankiet (dwa pytania z głosami tylko na
-- 2 odpowiedzi), tekstowa 6 -- obie poniżej progu podliczania (10). Zamknięte
-- ankiety są zgodne; szkice mogą być niepełne (to stan „szkic”).
--  * szablony (demo_template_data) -- od razu, dotyczą tylko nowych kont:
--    preparowana bez odpowiedzi <4 pkt (bez dopisywania punktów); otwarte
--    ankiety dopełnione do 10 ankiet powtórzeniami istniejących głosów, w
--    punktowej tak, by każde pytanie miało głosy na ≥3 odpowiedzi;
--  * kopie demo w grach użytkowników -- w nocnym oknie (e21_data_repair,
--    pg_cron 01:30 UTC), z pominięciem gier z niewygasłą sesją Control; tylko
--    kopie z treścią identyczną z szablonem sprzed tej migracji (ustawienia
--    gry nie mają znaczenia), a ankiety -- tylko z samymi głosami demo
--    w bieżącym uruchomieniu. ID pytań/odpowiedzi i istniejące głosy bez zmian.
-- Treść szablonów jest danymi demo aplikacji, nie użytkowników.

-- Szablony sprzed poprawki: wzorzec „nieedytowanej” kopii dla nocnej naprawy.
CREATE TABLE IF NOT EXISTS public.e21_demo_templates_before (
  lang text NOT NULL,
  slot text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (lang, slot)
);
REVOKE ALL ON public.e21_demo_templates_before FROM PUBLIC, anon, authenticated;
INSERT INTO public.e21_demo_templates_before (lang, slot, payload)
SELECT lang, slot, payload FROM public.demo_template_data
WHERE slot IN ('prepared', 'poll_points_open', 'poll_text_open')
ON CONFLICT (lang, slot) DO NOTHING;

-- Poprawiony szablon z szablonu sprzed poprawki (ta sama funkcja dla szablonów
-- i dla kopii: kopia dostaje dokładnie to, co nowe konto).
CREATE OR REPLACE FUNCTION public.e21_demo_fixed_payload(p_slot text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  c_votes constant int := 10;
  c_min_answers constant int := 3;
  v_out jsonb := p_payload;
  v_votes jsonb := coalesce(p_payload->'votes', '[]');
  v_n int := jsonb_array_length(coalesce(p_payload->'votes', '[]'));
  v_qn int := jsonb_array_length(coalesce(p_payload->'questions', '[]'));
  v_new jsonb;
  v_picks jsonb;
  v_counts int[];
  v_pick int;
  v_an int;
  j int; q int; i int;
BEGIN
  IF p_slot = 'prepared' THEN
    RETURN jsonb_set(v_out, '{questions}', coalesce((
      SELECT jsonb_agg(jsonb_set(qv, '{answers}', coalesce((
        SELECT jsonb_agg(a ORDER BY an) FROM jsonb_array_elements(coalesce(qv->'answers', '[]')) WITH ORDINALITY AS x(a, an)
        WHERE coalesce((a->>'fixed_points')::int, 0) >= 4), '[]')) ORDER BY qn)
      FROM jsonb_array_elements(p_payload->'questions') WITH ORDINALITY AS t(qv, qn)), '[]'));
  END IF;

  IF p_slot = 'poll_text_open' AND v_n > 0 AND v_n < c_votes THEN
    -- powtórzenia pierwszych ankiet: te same wpisy, bez nowych tekstów
    FOR j IN 1..(c_votes - v_n) LOOP
      v_votes := v_votes || jsonb_build_array(v_votes->((j - 1) % v_n));
    END LOOP;
    RETURN jsonb_set(v_out, '{votes}', v_votes);
  END IF;

  IF p_slot = 'poll_points_open' AND v_n > 0 AND v_n < c_votes THEN
    FOR j IN 1..(c_votes - v_n) LOOP
      v_picks := '[]';
      FOR q IN 1..v_qn LOOP
        v_an := jsonb_array_length(coalesce(p_payload->'questions'->(q - 1)->'answers', '[]'));
        -- liczba głosów na każdą odpowiedź pytania q (także dopisanych)
        v_counts := array_fill(0, ARRAY[greatest(v_an, 1)]);
        FOR i IN 0..(jsonb_array_length(v_votes) - 1) LOOP
          v_pick := (v_votes->i->'picks'->>(q - 1))::int;
          IF v_pick BETWEEN 0 AND v_an - 1 THEN v_counts[v_pick + 1] := v_counts[v_pick + 1] + 1; END IF;
        END LOOP;
        -- za mało odpowiedzi z głosami -> pierwsza bez głosów; inaczej powtórzenie
        IF (SELECT count(*) FROM unnest(v_counts) c WHERE c > 0) < least(c_min_answers, v_an) THEN
          SELECT min(k) - 1 INTO v_pick FROM generate_subscripts(v_counts, 1) k WHERE v_counts[k] = 0;
        ELSE
          v_pick := (v_votes->((j - 1) % v_n)->'picks'->>(q - 1))::int;
        END IF;
        v_picks := v_picks || to_jsonb(v_pick);
      END LOOP;
      v_new := jsonb_set(v_votes->((j - 1) % v_n), '{picks}', v_picks);
      v_votes := v_votes || jsonb_build_array(v_new);
    END LOOP;
    RETURN jsonb_set(v_out, '{votes}', v_votes);
  END IF;

  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.e21_demo_fixed_payload(text, jsonb) FROM PUBLIC, anon, authenticated;

UPDATE public.demo_template_data t
SET payload = public.e21_demo_fixed_payload(b.slot, b.payload)
FROM public.e21_demo_templates_before b
WHERE b.lang = t.lang AND b.slot = t.slot
  AND t.payload IS DISTINCT FROM public.e21_demo_fixed_payload(b.slot, b.payload);

-- Treść gry w postaci szablonu (pytania, odpowiedzi, punkty) -- porównanie
-- jak w migracji 298 (odpowiedzi szablonu przycinane do 17 jak przy seedzie).
CREATE OR REPLACE FUNCTION public.e21_demo_game_content(p_game_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('ord', q.ord, 'text', q.text, 'answers', coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord', a.ord, 'text', a.text, 'fixed_points', a.fixed_points) ORDER BY a.ord)
    FROM public.answers a WHERE a.question_id = q.id), '[]'::jsonb)) ORDER BY q.ord), '[]'::jsonb)
  FROM public.questions q WHERE q.game_id = p_game_id
$$;
CREATE OR REPLACE FUNCTION public.e21_demo_template_content(p_payload jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('ord', qn, 'text', q->>'text', 'answers', coalesce((
    SELECT jsonb_agg(jsonb_build_object('ord', an, 'text', left(trim(a->>'text'), 17),
      'fixed_points', coalesce((a->>'fixed_points')::int, 0)) ORDER BY an)
    FROM jsonb_array_elements(coalesce(q->'answers', '[]')) WITH ORDINALITY AS aa(a, an)), '[]'::jsonb)) ORDER BY qn), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_payload->'questions', '[]')) WITH ORDINALITY AS qq(q, qn)
$$;
REVOKE ALL ON FUNCTION public.e21_demo_game_content(uuid), public.e21_demo_template_content(jsonb) FROM PUBLIC, anon, authenticated;

-- Nocna poprawka kopii demo (wołana z e21_data_repair, ta sama ochrona Control).
CREATE OR REPLACE FUNCTION public.e21_demo_repair(p_skip uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  r record;
  v_new jsonb;
  v_n_old int;
  v_vote jsonb;
  v_qid uuid;
  v_sid uuid;
  v_aid uuid;
  v_pick int;
  v_raw text;
  v_tok text;
  j int; q int;
  v_prepared int := 0; v_answers int := 0; v_points int := 0; v_text int := 0; v_skipped int := 0;
BEGIN
  FOR r IN
    SELECT g.id, g.type::text AS type, g.status::text AS status, b.slot, b.payload AS old_payload
    FROM public.games g
    JOIN public.e21_demo_templates_before b
      ON b.payload->'game'->>'name' = g.name AND b.payload->'game'->>'type' = g.type::text
    WHERE g.is_demo
      AND ((b.slot = 'prepared' AND g.status = 'draft')
        OR (b.slot IN ('poll_points_open', 'poll_text_open') AND g.status IN ('poll_open', 'poll_stopped')))
      AND public.e21_demo_game_content(g.id) = public.e21_demo_template_content(b.payload)
  LOOP
    IF r.id = ANY (p_skip) THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    IF r.slot = 'prepared' THEN
      DELETE FROM public.answers a USING public.questions qq
      WHERE qq.id = a.question_id AND qq.game_id = r.id AND a.fixed_points < 4;
      GET DIAGNOSTICS j = ROW_COUNT;
      v_answers := v_answers + j;
      v_prepared := v_prepared + 1;
      CONTINUE;
    END IF;

    -- ankiety: tylko głosy demo, wszystkie pełne w bieżącym uruchomieniu
    v_n_old := jsonb_array_length(coalesce(r.old_payload->'votes', '[]'));
    IF v_n_old = 0
       OR EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.game_id = r.id AND v.voter_token NOT LIKE 'demo_seed_v%')
       OR EXISTS (SELECT 1 FROM public.poll_text_entries e WHERE e.game_id = r.id AND e.voter_token NOT LIKE 'demo_seed_v%')
       OR public._poll_full_submissions(r.id) <> v_n_old THEN
      CONTINUE;
    END IF;
    v_new := public.e21_demo_fixed_payload(r.slot, r.old_payload);
    FOR j IN (v_n_old + 1)..jsonb_array_length(v_new->'votes') LOOP
      v_vote := v_new->'votes'->(j - 1);
      v_tok := 'demo_seed_v' || lpad(j::text, 4, '0');
      FOR q IN 1..jsonb_array_length(v_new->'questions') LOOP
        SELECT qq.id INTO v_qid FROM public.questions qq WHERE qq.game_id = r.id AND qq.ord = q;
        SELECT ls.poll_session_id INTO v_sid FROM public._poll_latest_sessions(r.id) ls WHERE ls.question_id = v_qid;
        IF r.slot = 'poll_points_open' THEN
          v_pick := (v_vote->'picks'->>(q - 1))::int;
          SELECT a.id INTO v_aid FROM public.answers a WHERE a.question_id = v_qid AND a.ord = v_pick + 1;
          INSERT INTO public.poll_votes (game_id, question_ord, answer_ord, voter_token, poll_session_id, question_id, answer_id)
          VALUES (r.id, q, v_pick + 1, v_tok, v_sid, v_qid, v_aid);
        ELSE
          v_raw := v_vote->'answers_raw'->>(q - 1);
          INSERT INTO public.poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
          VALUES (r.id, v_sid, v_qid, v_tok, v_raw, lower(regexp_replace(trim(v_raw), '\s+', ' ', 'g')));
        END IF;
      END LOOP;
    END LOOP;
    IF r.slot = 'poll_points_open' THEN v_points := v_points + 1; ELSE v_text := v_text + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('demo_prepared_games', v_prepared, 'demo_prepared_answers_removed', v_answers,
    'demo_points_polls_filled', v_points, 'demo_text_polls_filled', v_text, 'demo_skipped_active_control', v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.e21_demo_repair(uuid[]) FROM PUBLIC, anon, authenticated;

-- e21_data_repair (407) + poprawka kopii demo w tym samym oknie i z tą samą
-- ochroną; raport rozszerzony o wynik demo.
CREATE OR REPLACE FUNCTION public.e21_data_repair() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_active uuid[];
  v_q int; v_a int; v_bq int; v_ba int;
  v_left_q int; v_left_a int; v_empty uuid[];
  v_demo jsonb;
  v_report jsonb;
  v_job bigint;
BEGIN
  -- Gry z niewygasłą sesją Control: bez zmian treści do jej końca/wygaśnięcia.
  SELECT coalesce(array_agg(DISTINCT game_id), '{}') INTO v_active
  FROM public.control_runtime_sessions WHERE ended_at IS NULL AND expires_at > now();

  -- Kopie demo (409): zwykły tryb -- usunięcie odpowiedzi i dopisanie głosów
  -- z wyzwalaczami i kluczami obcymi.
  v_demo := public.e21_demo_repair(v_active);

  -- Bez wyzwalaczy (oczekujące kopie, cache reguł, updated_at): zmiana samego
  -- tekstu tych samych wierszy; rules_state przeliczany niżej.
  PERFORM set_config('session_replication_role', 'replica', true);

  UPDATE public.questions q SET text = btrim(left(btrim(q.text), 100))
  WHERE char_length(q.text) > 100 AND q.game_id <> ALL (v_active);
  GET DIAGNOSTICS v_q = ROW_COUNT;

  UPDATE public.answers a SET text = public.fam_answer_clean(a.text)
  FROM public.questions q
  WHERE q.id = a.question_id AND q.game_id <> ALL (v_active)
    AND cardinality(public.fam_answer_invalid_chars(a.text)) > 0 AND public.fam_answer_clean(a.text) <> '';
  GET DIAGNOSTICS v_a = ROW_COUNT;

  -- Bazy pytań: payload.text ≤100; odpowiedzi ≤17 i znaki z czcionki.
  UPDATE public.qb_questions SET payload = jsonb_set(payload, '{text}', to_jsonb(btrim(left(btrim(payload->>'text'), 100))))
  WHERE jsonb_typeof(payload->'text') = 'string' AND char_length(payload->>'text') > 100;
  GET DIAGNOSTICS v_bq = ROW_COUNT;

  WITH bad AS (
    SELECT q.id FROM public.qb_questions q
    WHERE jsonb_typeof(q.payload->'answers') = 'array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(q.payload->'answers') a
      WHERE jsonb_typeof(a->'text') = 'string'
        AND (char_length(a->>'text') > 17 OR cardinality(public.fam_answer_invalid_chars(a->>'text')) > 0)
        AND public.fam_answer_clean(a->>'text') <> '')
  )
  UPDATE public.qb_questions q SET payload = jsonb_set(q.payload, '{answers}', (
    SELECT jsonb_agg(CASE
      WHEN jsonb_typeof(a->'text') = 'string'
           AND (char_length(a->>'text') > 17 OR cardinality(public.fam_answer_invalid_chars(a->>'text')) > 0)
           AND public.fam_answer_clean(a->>'text') <> ''
        THEN jsonb_set(a, '{text}', to_jsonb(public.fam_answer_clean(a->>'text')))
      ELSE a END ORDER BY i)
    FROM jsonb_array_elements(q.payload->'answers') WITH ORDINALITY AS t(a, i)))
  FROM bad WHERE bad.id = q.id;
  GET DIAGNOSTICS v_ba = ROW_COUNT;

  -- Cache reguł po naprawie (bez zmiany updated_at -- nadal bez wyzwalaczy).
  UPDATE public.games g SET rules_state = public.game_rules_compute(g.id, g.type::text, g.status::text)
  WHERE g.id <> ALL (v_active);
  PERFORM set_config('session_replication_role', 'origin', true);

  -- Co zostało: pytania >100 (aktywne gry) i odpowiedzi do decyzji (puste po oczyszczeniu).
  SELECT count(*) INTO v_left_q FROM public.questions WHERE char_length(text) > 100;
  SELECT count(*) INTO v_left_a FROM public.answers WHERE cardinality(public.fam_answer_invalid_chars(text)) > 0;
  SELECT coalesce(array_agg(a.id ORDER BY a.id), '{}') INTO v_empty
  FROM public.answers a WHERE cardinality(public.fam_answer_invalid_chars(a.text)) > 0 AND public.fam_answer_clean(a.text) = '';

  -- Ograniczenia bazy, gdy dane są czyste (wcześniej NOT VALID zablokowałby
  -- zwykłe zmiany innych kolumn w wierszach czekających na naprawę).
  IF v_left_q = 0 THEN
    ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_text_len;
    ALTER TABLE public.questions ADD CONSTRAINT questions_text_len CHECK (char_length(text) BETWEEN 1 AND 100);
  END IF;
  IF v_left_a = 0 AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'answers_text_chars') THEN
    ALTER TABLE public.answers ADD CONSTRAINT answers_text_chars CHECK (cardinality(public.fam_answer_invalid_chars(text)) = 0);
  END IF;

  v_report := jsonb_build_object(
    'questions_truncated', v_q, 'answers_cleaned', v_a,
    'base_questions_truncated', v_bq, 'base_questions_answers_fixed', v_ba,
    'skipped_active_control_games', to_jsonb(v_active),
    'questions_over_100_left', v_left_q, 'answers_invalid_left', v_left_a,
    'answers_empty_after_clean', to_jsonb(v_empty),
    'questions_constraint', v_left_q = 0, 'answers_constraint', v_left_a = 0) || v_demo;
  INSERT INTO public.e21_repair_runs(report) VALUES (v_report);
  RAISE NOTICE 'e21_data_repair: %', v_report;

  -- Koniec: zostały co najwyżej odpowiedzi czekające na decyzję i żadna kopia
  -- demo nie czekała na koniec sesji Control -> zadanie nie wraca.
  IF v_left_q = 0 AND v_left_a = cardinality(v_empty) AND coalesce((v_demo->>'demo_skipped_active_control')::int, 0) = 0
     AND to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''e21-data-repair'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
  END IF;
  RETURN v_report;
END $$;
REVOKE ALL ON FUNCTION public.e21_data_repair() FROM PUBLIC, anon, authenticated;

-- Raport: szablony po poprawce względem reguł typu (liczby, bez treści).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT slot, lang,
      jsonb_array_length(coalesce(payload->'votes', '[]')) AS votes,
      (SELECT count(*) FROM jsonb_array_elements(coalesce(payload->'questions', '[]')) q,
         jsonb_array_elements(coalesce(q->'answers', '[]')) a WHERE slot = 'prepared' AND coalesce((a->>'fixed_points')::int, 0) < 4) AS low,
      (SELECT min(jsonb_array_length(coalesce(q->'answers', '[]'))) FROM jsonb_array_elements(coalesce(payload->'questions', '[]')) q) AS amin
    FROM public.demo_template_data WHERE slot IN ('prepared', 'poll_points_open', 'poll_text_open') ORDER BY slot, lang LOOP
    RAISE NOTICE 'E21 demo po poprawce %/%: ankiet %, odpowiedzi <4 pkt %, min. odpowiedzi w pytaniu %', r.slot, r.lang, r.votes, r.low, r.amin;
  END LOOP;
END $$;
