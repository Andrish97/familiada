-- ============================================================
-- 167: market_game_by_slug — SECURITY DEFINER + GRANT EXECUTE
--      Funkcja była wywoływana przez Cloudflare Worker (service_role)
--      ale nie miała SECURITY DEFINER ani grantu — zwracała błąd permissions.
-- ============================================================

DROP FUNCTION IF EXISTS public.market_game_by_slug(text);

CREATE FUNCTION public.market_game_by_slug(p_slug text)
RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  author_username text,
  status          public.market_game_status,
  payload         jsonb,
  in_library      boolean,
  origin          text,
  slug            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    mg.status, mg.payload,
    CASE
      WHEN auth.uid() IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.user_market_library uml
         WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid()
      )
    END AS in_library,
    mg.origin::text AS origin,
    mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.slug = p_slug AND mg.status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.market_game_by_slug(text) TO anon, authenticated, service_role;
