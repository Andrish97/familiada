-- 090: Rename storage folder from admin/ to marketplace/ in market_games
-- This is to match user expectations and make the structure clearer.

UPDATE public.market_games
SET storage_path = REPLACE(storage_path, 'admin/', 'marketplace/')
WHERE storage_path LIKE 'admin/%';

-- Ensure we use marketplace/ prefix for new games
COMMENT ON COLUMN public.market_games.storage_path IS 'Path to JSON in community-games bucket (prefix: marketplace/)';
