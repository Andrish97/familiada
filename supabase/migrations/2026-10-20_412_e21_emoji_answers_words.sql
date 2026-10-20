-- 412: E21 — decyzja użytkownika 2026-10-20: 5 odpowiedzi jednej gry
-- (preparowana, szkic, bez głosów) złożonych z samych emotek zamienione na
-- słowa opisujące emotkę. Tylko ID i nowe słowa (bez nazwy gry, pytania
-- i właściciela). Zmiana tylko, gdy ID, punkty się zgadzają, tekst nadal jest
-- pusty po oczyszczeniu i gra nie ma niewygasłej sesji Control.

DO $$
DECLARE
  n int;
BEGIN
  UPDATE public.answers a SET text = v.word
  FROM (VALUES
    ('294f9a9b-4aee-4484-aac8-d2fc30f3ea6b'::uuid, 30, 'Płacząca buźka'),
    ('c2443b62-0b16-49c1-b43c-3e93ae076aac'::uuid, 20, 'Łyżka'),
    ('bc634a0c-9ffd-496b-8637-9acd55324d33'::uuid, 15, 'Świnka'),
    ('b7a89290-c4f3-4f3d-ac2d-6d81f316802a'::uuid, 10, 'Zakochana buźka'),
    ('fefe1306-f229-4655-83f5-6fbac32a8c5f'::uuid, 5, 'Smutna buźka')
  ) AS v(id, pts, word), public.questions q
  WHERE a.id = v.id AND a.fixed_points = v.pts AND q.id = a.question_id
    AND public.fam_answer_clean(a.text) = ''
    AND NOT public._game_control_active(q.game_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM (VALUES ('Płacząca buźka'), ('Łyżka'), ('Świnka'), ('Zakochana buźka'), ('Smutna buźka')) w(t)
             WHERE cardinality(public.fam_answer_invalid_chars(w.t)) > 0 OR char_length(w.t) > 17) THEN
    RAISE EXCEPTION 'słowa spoza czcionki lub >17';
  END IF;
  RAISE NOTICE 'E21 emotki -> słowa: % odpowiedzi', n;
END $$;
