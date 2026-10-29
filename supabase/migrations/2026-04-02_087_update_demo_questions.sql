-- 087: Update demo questions and user games - "Sondaż:" → "Ankieta:"

-- 1. Update poll questions in demo_template_data (base template) that start with "Sondaż:"
UPDATE public.demo_template_data
SET payload = jsonb_set(
  payload,
  '{questions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN q->>'text' LIKE 'Sondaż:%'
        THEN jsonb_set(q, '{text}', to_jsonb('Ankieta:' || substring(q->>'text' FROM 8)))
        ELSE q
      END
    )
    FROM jsonb_array_elements(payload->'questions') AS q
  )
)
WHERE payload->>'questions' LIKE '%Sondaż:%';

-- 2. Update game names in demo_template_data that reference "Sondaż tekstowy"
UPDATE public.demo_template_data
SET payload = jsonb_set(
  payload,
  '{name}',
  to_jsonb(replace(payload->>'name', 'Sondaż tekstowy', 'Typowa ankieta'))
)
WHERE payload->>'name' LIKE '%Sondaż tekstowy%';

-- 3. Update user games created from demo templates (games table)
-- This fixes existing user data with old demo names
UPDATE public.games
SET name = replace(name, 'Sondaż tekstowy', 'Typowa ankieta')
WHERE name LIKE '%Sondaż tekstowy%';

-- 4. Update questions in user games that start with "Sondaż:"
UPDATE public.games
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
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(data->'questions') AS q
  WHERE q->>'text' LIKE 'Sondaż:%'
);

-- 5. Update shared_devices game_name (user-visible data)
UPDATE public.shared_devices
SET game_name = replace(game_name, 'Sondaż tekstowy', 'Typowa ankieta')
WHERE game_name LIKE '%Sondaż tekstowy%';

-- Log the update
DO $$
DECLARE
  updated_demo_templates integer;
  updated_user_games integer;
  updated_questions integer;
  updated_shared_devices integer;
BEGIN
  SELECT COUNT(*) INTO updated_demo_templates FROM public.demo_template_data WHERE payload->>'questions' LIKE '%Ankieta:%' OR payload->>'name' LIKE '%Typowa ankieta%';
  SELECT COUNT(*) INTO updated_user_games FROM public.games WHERE name LIKE '%Typowa ankieta%';
  SELECT COUNT(*) INTO updated_questions FROM public.games g, jsonb_array_elements(g.data->'questions') AS q WHERE q->>'text' LIKE 'Ankieta:%';
  SELECT COUNT(*) INTO updated_shared_devices FROM public.shared_devices WHERE game_name LIKE '%Typowa ankieta%';

  RAISE NOTICE 'Updated demo_template_data: %', updated_demo_templates;
  RAISE NOTICE 'Updated user games (Sondaż tekstowy → Typowa ankieta): %', updated_user_games;
  RAISE NOTICE 'Updated user game questions (Sondaż: → Ankieta:): %', updated_questions;
  RAISE NOTICE 'Updated shared_devices game_name: %', updated_shared_devices;
END $$;
