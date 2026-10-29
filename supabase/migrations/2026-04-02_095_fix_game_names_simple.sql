-- 095: Fix game names - SIMPLE APPROACH (one UPDATE per pattern)
-- This migration updates ONLY the games.name column

-- Update each pattern separately to avoid SQL syntax issues
UPDATE public.games SET name = 'Typowa ankieta' WHERE name = 'Sondaż tekstowy';
UPDATE public.games SET name = 'Typowa ankieta' WHERE name = 'Sondaż typowy';
UPDATE public.games SET name = 'Punktacja' WHERE name = 'Sondaż punktowy';
UPDATE public.games SET name = 'Nowa ankieta' WHERE name = 'Nowy sondaż';
UPDATE public.games SET name = 'Nowa preparowana' WHERE name = 'Nowy preparowany';

-- For names that contain "(Sondaż)" as part of longer name (e.g., "Nowa Familiada (Sondaż)")
UPDATE public.games SET name = replace(name, '(Sondaż)', '(Ankieta)') WHERE name LIKE '%(Sondaż)%';

-- For any remaining names that still contain "Sondaż"
UPDATE public.games SET name = replace(name, 'Sondaż', 'Ankieta') WHERE name LIKE '%Sondaż%';

-- Log remaining
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT COUNT(*) INTO remaining FROM public.games WHERE name LIKE '%Sondaż%' OR name LIKE '%Nowy%';
  RAISE NOTICE 'Remaining games with old names: %', remaining;
END $$;
