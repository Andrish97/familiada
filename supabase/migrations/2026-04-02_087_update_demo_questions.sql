-- 087: Update demo questions - "Sondaż:" → "Ankieta:"

-- Update poll questions in demo base that start with "Sondaż:"
-- These are placeholder questions that indicate a poll type

UPDATE public.demo_bases 
SET data = jsonb_set(
  data,
  '{questions}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN q->>'text' LIKE 'Sondaż:%' 
        THEN jsonb_set(q, '{text}', to_jsonb('Ankieta:' || substring(q->>'text' FROM 8)))
        ELSE q
      END
    )
    FROM jsonb_array_elements(data->'questions') AS q
  )
)
WHERE data->>'questions' LIKE '%Sondaż:%';

-- Also update game names in demo_games that reference "Sondaż tekstowy"
UPDATE public.demo_games
SET data = jsonb_set(
  data,
  '{name}',
  to_jsonb(replace(data->>'name', 'Sondaż tekstowy', 'Typowa ankieta'))
)
WHERE data->>'name' LIKE '%Sondaż tekstowy%';

-- Log the update
DO $$
DECLARE
  updated_bases integer;
  updated_games integer;
BEGIN
  SELECT COUNT(*) INTO updated_bases FROM public.demo_bases WHERE data->>'questions' LIKE '%Ankieta:%';
  SELECT COUNT(*) INTO updated_games FROM public.demo_games WHERE data->>'name' LIKE '%Typowa ankieta%';
  
  RAISE NOTICE 'Updated demo_bases with "Ankieta:" prefix: %', updated_bases;
  RAISE NOTICE 'Updated demo_games with "Typowa ankieta" name: %', updated_games;
END $$;
