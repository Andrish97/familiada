-- ============================================================
-- 131: Trigger — automatyczne nadawanie slug przy INSERT/UPDATE
--      na market_games gdy status = 'published' i slug IS NULL
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_market_games_assign_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Nadaj slug jeśli gra jest/staje się published i slug jest pusty
  IF NEW.status = 'published' AND (NEW.slug IS NULL OR NEW.slug = '') THEN
    NEW.slug := public.unique_market_slug(NEW.title, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_market_games_slug
  BEFORE INSERT OR UPDATE OF status, slug
  ON public.market_games
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_market_games_assign_slug();
