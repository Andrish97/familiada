-- 092: Fix ALL remaining game name variations
-- Comprehensive update for all "Sondaż" and "preparowany" variations

-- 1. Update demo_template_data names - ALL variations
UPDATE public.demo_template_data
SET payload = jsonb_set(
  payload,
  '{name}',
  to_jsonb(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(payload->>'name', 
                'Sondaż tekstowy', 'Typowa ankieta'),
              'Sondaż typowy', 'Typowa ankieta'),
            'Sondaż punktowy', 'Punktacja'),
          'Nowy sondaż', 'Nowa ankieta'),
        'Nowy preparowany', 'Nowa preparowana'),
      '(Sondaż)', '(Ankieta)')
)
WHERE payload->>'name' LIKE '%Sondaż%' OR payload->>'name' LIKE '%Nowy%';

-- 2. Update user games names - ALL variations
UPDATE public.games
SET name = replace(
      replace(
        replace(
          replace(
            replace(
              replace(name, 
                'Sondaż tekstowy', 'Typowa ankieta'),
              'Sondaż typowy', 'Typowa ankieta'),
            'Sondaż punktowy', 'Punktacja'),
          'Nowy sondaż', 'Nowa ankieta'),
        'Nowy preparowany', 'Nowa preparowana'),
      '(Sondaż)', '(Ankieta)')
WHERE name LIKE '%Sondaż%' OR name LIKE '%Nowy%';

-- 3. Update shared_devices game_name - ALL variations
UPDATE public.shared_devices
SET game_name = replace(
      replace(
        replace(
          replace(
            replace(
              replace(game_name, 
                'Sondaż tekstowy', 'Typowa ankieta'),
              'Sondaż typowy', 'Typowa ankieta'),
            'Sondaż punktowy', 'Punktacja'),
          'Nowy sondaż', 'Nowa ankieta'),
        'Nowy preparowany', 'Nowa preparowana'),
      '(Sondaż)', '(Ankieta)')
WHERE game_name LIKE '%Sondaż%' OR game_name LIKE '%Nowy%';

-- Log remaining
DO $$
DECLARE
  remaining_demo integer;
  remaining_games integer;
  remaining_shared integer;
BEGIN
  SELECT COUNT(*) INTO remaining_demo FROM public.demo_template_data WHERE payload->>'name' LIKE '%Sondaż%' OR payload->>'name' LIKE '%Nowy%';
  SELECT COUNT(*) INTO remaining_games FROM public.games WHERE name LIKE '%Sondaż%' OR name LIKE '%Nowy%';
  SELECT COUNT(*) INTO remaining_shared FROM public.shared_devices WHERE game_name LIKE '%Sondaż%' OR game_name LIKE '%Nowy%';

  RAISE NOTICE 'Remaining demo_template_data with old names: %', remaining_demo;
  RAISE NOTICE 'Remaining games with old names: %', remaining_games;
  RAISE NOTICE 'Remaining shared_devices with old names: %', remaining_shared;
END $$;
