-- ============================================================
-- 130: Backfill slug dla opublikowanych gier które go nie mają
-- ============================================================

DO $$
DECLARE
  r      record;
  v_slug text;
BEGIN
  FOR r IN
    SELECT id, title
      FROM public.market_games
     WHERE slug IS NULL
       AND status = 'published'
     ORDER BY created_at ASC
  LOOP
    v_slug := public.unique_market_slug(r.title, r.id);
    UPDATE public.market_games SET slug = v_slug WHERE id = r.id;
  END LOOP;
END;
$$;
