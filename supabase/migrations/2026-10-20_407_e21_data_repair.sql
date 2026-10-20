-- 407: E21 — migracja naprawcza danych wszystkich użytkowników
-- (docs/reguly-gier-transfer-plan.md §4 „Migracja starych gier i odzyskiwanie”).
-- Wykonanie w nocnym oknie: funkcja public.e21_data_repair() uruchamiana przez
-- pg_cron o 01:30 UTC; pomija gry z niewygasłą sesją Control (wracają w kolejną
-- noc), jest idempotentna, zapisuje raport w public.e21_repair_runs i po
-- zakończeniu sama usuwa zadanie cron.
--  * pytania gier (wszystkie typy i statusy, także ankiety i kopie market)
--    obcięte do 100 znaków; ID, ord, głosy, status i punkty bez zmian;
--  * odpowiedzi gier: znaki spoza czcionki 5x7 usunięte (fam_answer_clean) --
--    tylko odpowiedzi; odpowiedzi, które byłyby puste, zostają bez zmian
--    i trafiają do raportu (decyzja użytkownika);
--  * bazy pytań: pytanie ≤100, odpowiedź ≤17 i znaki z czcionki;
--  * przeliczenie rules_state; ograniczenia bazy (pytanie ≤100, znaki
--    odpowiedzi) zakładane, gdy dane są już czyste.
-- Treść pytań i odpowiedzi nie trafia do raportu (tylko liczby i ID).

CREATE TABLE IF NOT EXISTS public.e21_repair_runs (
  id bigserial PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  report jsonb NOT NULL
);
REVOKE ALL ON public.e21_repair_runs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.e21_data_repair() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_active uuid[];
  v_q int; v_a int; v_bq int; v_ba int;
  v_left_q int; v_left_a int; v_empty uuid[];
  v_report jsonb;
  v_job bigint;
BEGIN
  -- Gry z niewygasłą sesją Control: bez zmian treści do jej końca/wygaśnięcia.
  SELECT coalesce(array_agg(DISTINCT game_id), '{}') INTO v_active
  FROM public.control_runtime_sessions WHERE ended_at IS NULL AND expires_at > now();

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

  PERFORM set_config('session_replication_role', 'origin', true);

  -- Cache reguł po naprawie (bez zmiany updated_at -- znów bez wyzwalaczy).
  PERFORM set_config('session_replication_role', 'replica', true);
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
    'questions_constraint', v_left_q = 0, 'answers_constraint', v_left_a = 0);
  INSERT INTO public.e21_repair_runs(report) VALUES (v_report);
  RAISE NOTICE 'e21_data_repair: %', v_report;

  -- Koniec: zostały co najwyżej odpowiedzi czekające na decyzję -> zadanie nie wraca.
  IF v_left_q = 0 AND v_left_a = cardinality(v_empty) AND to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''e21-data-repair'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
  END IF;
  RETURN v_report;
END $$;
REVOKE ALL ON FUNCTION public.e21_data_repair() FROM PUBLIC, anon, authenticated;

-- Nocne okno: 01:30 UTC (03:30 w Polsce w czasie letnim, 02:30 w zimowym).
DO $$
DECLARE v_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''e21-data-repair'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
    PERFORM cron.schedule('e21-data-repair', '30 1 * * *', 'SELECT public.e21_data_repair()');
  END IF;
END $$;
