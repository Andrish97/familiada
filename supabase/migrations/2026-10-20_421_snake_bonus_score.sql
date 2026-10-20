-- 421: wąż z bonusami (decyzja użytkownika 2026-10-20) -- co 5 jabłek bonus
-- za 5..15 punktów, więc wynik nie jest już równy liczbie jabłek (<= 300).
-- Teoretyczne maksimum ok. 1200 (297 jabłek + 59 bonusów po 15); limit 2000.
-- Zmiana tylko limitu: ograniczenie kolumny i przycięcie w snake_log
-- (definicja funkcji z bazy z podmienionym napisem, jak w 402).
ALTER TABLE public.snake_events DROP CONSTRAINT snake_events_score_check;
ALTER TABLE public.snake_events ADD CONSTRAINT snake_events_score_check CHECK (score BETWEEN 0 AND 2000);

DO $$
DECLARE v_def text := pg_get_functiondef('public.snake_log(text, text, integer, text)'::regprocedure);
BEGIN
  IF position('least(greatest(coalesce(p_score, 0), 0), 300)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'snake_log: nie znaleziono limitu 300';
  END IF;
  EXECUTE replace(v_def, 'least(greatest(coalesce(p_score, 0), 0), 300)', 'least(greatest(coalesce(p_score, 0), 0), 2000)');
END;
$$;

NOTIFY pgrst, 'reload schema';
