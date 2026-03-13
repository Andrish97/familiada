-- 077: naprawa market_games storage_path
-- Naprawia migracje 073 ktora nie mogla ustawic NOT NULL na storage_path

-- Dodaj kolumne storage_path jesli nie istnieje
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_games' AND column_name = 'storage_path') THEN
    ALTER TABLE public.market_games ADD COLUMN storage_path text;
  END IF;
END $$;

-- Uzupelnij NULLowe wartosci dla starych gier z gh_slug
UPDATE public.market_games 
SET storage_path = 'github/' || gh_slug || '.json'
WHERE storage_path IS NULL AND gh_slug IS NOT NULL;

-- Dla gier bez gh_slug (nowe) - ustaw na userId/lang/slug.json
-- To wymaga recznego uzupelnienia lub defaulta
-- Na ten moment zostawiamy NULL dla gier ktore nie maja gh_slug

-- Usun gh_slug
ALTER TABLE public.market_games DROP COLUMN IF EXISTS gh_slug;

-- Index
CREATE INDEX IF NOT EXISTS market_games_storage_path_idx 
  ON public.market_games (storage_path);
