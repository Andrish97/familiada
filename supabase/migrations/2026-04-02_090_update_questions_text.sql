-- 090: Update questions text - "Sondaż:" → "Ankieta:"
-- This migration updates question texts in the questions table

UPDATE public.questions
SET text = 'Ankieta:' || substring(text FROM 8)
WHERE text LIKE 'Sondaż:%';

-- Log
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.questions WHERE text LIKE 'Ankieta:%';
  RAISE NOTICE 'Updated questions (Sondaż: → Ankieta:): %', cnt;
END $$;
