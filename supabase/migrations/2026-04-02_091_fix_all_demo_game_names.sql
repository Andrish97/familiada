-- 091: Fix ALL demo game names - comprehensive update
-- This migration fixes all variations of "Sondaż" in game names

-- 1. Update demo_template_data names - all variations
UPDATE public.demo_template_data
SET payload = jsonb_set(
  payload,
  '{name}',
  to_jsonb(
    replace(
      replace(
        replace(
          replace(payload->>'name', 
            'Sondaż tekstowy', 'Typowa ankieta'),
          'Sondaż typowy', 'Typowa ankieta'),
        'Sondaż punktowy', 'Punktacja'),
      'Preparowana', 'Preparowana') -- already correct, but for completeness
)
WHERE payload->>'name' LIKE '%Sondaż%';

-- 2. Update user games names - all variations
UPDATE public.games
SET name = replace(
      replace(
        replace(name, 
          'Sondaż tekstowy', 'Typowa ankieta'),
        'Sondaż typowy', 'Typowa ankieta'),
      'Sondaż punktowy', 'Punktacja')
WHERE name LIKE '%Sondaż%';

-- 3. Update shared_devices game_name - all variations
UPDATE public.shared_devices
SET game_name = replace(
      replace(
        replace(game_name, 
          'Sondaż tekstowy', 'Typowa ankieta'),
        'Sondaż typowy', 'Typowa ankieta'),
      'Sondaż punktowy', 'Punktacja')
WHERE game_name LIKE '%Sondaż%';

-- Log the update
DO $$
DECLARE
  updated_demo integer;
  updated_games integer;
  updated_shared integer;
BEGIN
  SELECT COUNT(*) INTO updated_demo FROM public.demo_template_data WHERE payload->>'name' LIKE '%Sondaż%';
  SELECT COUNT(*) INTO updated_games FROM public.games WHERE name LIKE '%Sondaż%';
  SELECT COUNT(*) INTO updated_shared FROM public.shared_devices WHERE game_name LIKE '%Sondaż%';

  RAISE NOTICE 'Remaining demo_template_data with "Sondaż": %', updated_demo;
  RAISE NOTICE 'Remaining games with "Sondaż": %', updated_games;
  RAISE NOTICE 'Remaining shared_devices with "Sondaż": %', updated_shared;
END $$;
