-- 094: Fix ALL remaining game name variations (WORKING VERSION)
-- Using regexp_replace for partial matches

-- ============================================
-- DEMO_TEMPLATE_DATA - using regexp_replace for partial matches
-- ============================================

UPDATE public.demo_template_data
SET payload = jsonb_set(
  payload,
  '{name}',
  to_jsonb(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(payload->>'name', 
              'Sondaż tekstowy', 'Typowa ankieta', 'g'),
            'Sondaż typowy', 'Typowa ankieta', 'g'),
          'Sondaż punktowy', 'Punktacja', 'g'),
        'Nowy sondaż', 'Nowa ankieta', 'g'),
      'Nowy preparowany', 'Nowa preparowana', 'g'),
    '\(Sondaż\)', '(Ankieta)', 'g'))
)
WHERE payload->>'name' LIKE '%Sondaż%' OR payload->>'name' LIKE '%Nowy%';

-- ============================================
-- GAMES (user games)
-- ============================================

UPDATE public.games
SET name = regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(name, 
                'Sondaż tekstowy', 'Typowa ankieta', 'g'),
              'Sondaż typowy', 'Typowa ankieta', 'g'),
            'Sondaż punktowy', 'Punktacja', 'g'),
          'Nowy sondaż', 'Nowa ankieta', 'g'),
        'Nowy preparowany', 'Nowa preparowana', 'g'),
      '\(Sondaż\)', '(Ankieta)', 'g')
WHERE name LIKE '%Sondaż%' OR name LIKE '%Nowy%';

-- ============================================
-- SHARED_DEVICES
-- ============================================

UPDATE public.shared_devices
SET game_name = regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(game_name, 
                'Sondaż tekstowy', 'Typowa ankieta', 'g'),
              'Sondaż typowy', 'Typowa ankieta', 'g'),
            'Sondaż punktowy', 'Punktacja', 'g'),
          'Nowy sondaż', 'Nowa ankieta', 'g'),
        'Nowy preparowany', 'Nowa preparowana', 'g'),
      '\(Sondaż\)', '(Ankieta)', 'g')
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
