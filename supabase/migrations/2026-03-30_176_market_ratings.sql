-- 176: Marketplace game ratings
--   + table:   market_game_ratings  (market_game_id, user_id, stars 1-5)
--   + columns: market_games.avg_rating, market_games.rating_count
--   + trigger: sync avg_rating / rating_count on every change
--   + RPCs:    market_rate_game, market_game_raters, market_admin_producer_games
--   + updates: market_browse (+ rating cols + ordering), market_game_detail, market_my_submissions

-- 1. New columns on market_games
ALTER TABLE public.market_games
  ADD COLUMN IF NOT EXISTS avg_rating   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer      NOT NULL DEFAULT 0;

-- 2. Ratings table
CREATE TABLE IF NOT EXISTS public.market_game_ratings (
  market_game_id uuid     NOT NULL REFERENCES public.market_games(id) ON DELETE CASCADE,
  user_id        uuid     NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  stars          smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_game_id, user_id)
);

ALTER TABLE public.market_game_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgr_select" ON public.market_game_ratings FOR SELECT USING (true);
CREATE POLICY "mgr_insert" ON public.market_game_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mgr_update" ON public.market_game_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "mgr_delete" ON public.market_game_ratings FOR DELETE USING (auth.uid() = user_id);

-- 3. Trigger: keep avg_rating / rating_count in sync
CREATE OR REPLACE FUNCTION public.sync_market_game_rating_stats()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE(NEW.market_game_id, OLD.market_game_id);
  UPDATE public.market_games
  SET
    rating_count = (SELECT COUNT(*) FROM public.market_game_ratings WHERE market_game_id = v_id),
    avg_rating   = COALESCE((SELECT ROUND(AVG(stars::numeric), 2) FROM public.market_game_ratings WHERE market_game_id = v_id), 0)
  WHERE id = v_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_game_rating_stats ON public.market_game_ratings;
CREATE TRIGGER trg_market_game_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.market_game_ratings
  FOR EACH ROW EXECUTE FUNCTION public.sync_market_game_rating_stats();

-- 4. RPC: submit / update rating (once per user per game)
CREATE OR REPLACE FUNCTION public.market_rate_game(p_market_game_id uuid, p_stars int)
RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'; RETURN; END IF;
  IF p_stars < 1 OR p_stars > 5 THEN RETURN QUERY SELECT false, 'invalid_stars'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.market_games WHERE id = p_market_game_id AND status = 'published') THEN
    RETURN QUERY SELECT false, 'game_not_found'; RETURN;
  END IF;
  -- Authors cannot rate their own game
  IF EXISTS (SELECT 1 FROM public.market_games WHERE id = p_market_game_id AND author_user_id = v_uid) THEN
    RETURN QUERY SELECT false, 'cannot_rate_own_game'; RETURN;
  END IF;
  INSERT INTO public.market_game_ratings (market_game_id, user_id, stars)
  VALUES (p_market_game_id, v_uid, p_stars)
  ON CONFLICT (market_game_id, user_id) DO UPDATE SET stars = EXCLUDED.stars;
  RETURN QUERY SELECT true, ''::text;
END;
$$;

-- 5. RPC: list raters — only for game creator or service_role (auth.uid() IS NULL)
CREATE OR REPLACE FUNCTION public.market_game_raters(p_market_game_id uuid)
RETURNS TABLE(username text, stars smallint, rated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.market_games WHERE id = p_market_game_id AND author_user_id = auth.uid()
  ) THEN RETURN; END IF;
  RETURN QUERY
    SELECT COALESCE(pr.username, '?')::text, r.stars, r.created_at AS rated_at
    FROM public.market_game_ratings r
    LEFT JOIN public.profiles pr ON pr.id = r.user_id
    WHERE r.market_game_id = p_market_game_id
    ORDER BY r.created_at DESC;
END;
$$;

-- 6. RPC: admin list producer games with rating stats
CREATE OR REPLACE FUNCTION public.market_admin_producer_games()
RETURNS TABLE(id uuid, title text, lang text, status text, avg_rating numeric, rating_count integer, library_count integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT mg.id, mg.title, mg.lang, mg.status::text, mg.avg_rating, mg.rating_count, mg.library_count, mg.created_at
  FROM public.market_games mg
  WHERE mg.origin = 'producer'
  ORDER BY mg.avg_rating DESC NULLS LAST, mg.rating_count DESC, mg.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.market_rate_game(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.market_game_raters(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_admin_producer_games() TO service_role;

-- 7. Update market_browse: add rating cols + updated ordering (avg_rating if ≥3 votes)
CREATE OR REPLACE FUNCTION public.market_browse(
  p_lang   text    DEFAULT 'pl',
  p_search text    DEFAULT '',
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  avg_rating      numeric,
  rating_count    integer,
  user_stars      smallint,
  author_username text,
  created_at      timestamptz,
  in_library      boolean,
  origin          text
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    mg.avg_rating, mg.rating_count,
    (SELECT r.stars FROM public.market_game_ratings r
      WHERE r.market_game_id = mg.id AND r.user_id = auth.uid()) AS user_stars,
    COALESCE(pr.username, '') AS author_username,
    mg.created_at,
    CASE WHEN auth.uid() IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.user_market_library uml
                       WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid())
    END AS in_library,
    mg.origin::text AS origin
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = 'published'
    AND (p_search = '' OR mg.title ILIKE '%' || p_search || '%' OR mg.description ILIKE '%' || p_search || '%')
  ORDER BY
    (mg.lang = p_lang) DESC,
    CASE WHEN mg.rating_count >= 3 THEN mg.avg_rating ELSE 0 END DESC,
    mg.library_count DESC,
    mg.created_at DESC
  LIMIT LEAST(p_limit, 100) OFFSET p_offset;
$$;

-- 8. Update market_game_detail: add rating cols
CREATE OR REPLACE FUNCTION public.market_game_detail(p_id uuid)
RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  avg_rating      numeric,
  rating_count    integer,
  user_stars      smallint,
  author_username text,
  status          public.market_game_status,
  payload         jsonb,
  in_library      boolean,
  origin          text,
  slug            text
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    mg.avg_rating, mg.rating_count,
    (SELECT r.stars FROM public.market_game_ratings r
      WHERE r.market_game_id = mg.id AND r.user_id = auth.uid()) AS user_stars,
    COALESCE(pr.username, '') AS author_username,
    mg.status, mg.payload,
    CASE WHEN auth.uid() IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.user_market_library uml
                       WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid())
    END AS in_library,
    mg.origin::text AS origin,
    mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;

-- 9. Update market_my_submissions: add rating cols
CREATE OR REPLACE FUNCTION public.market_my_submissions()
RETURNS TABLE(
  id              uuid,
  source_game_id  uuid,
  title           text,
  description     text,
  lang            text,
  status          public.market_game_status,
  moderation_note text,
  library_count   integer,
  avg_rating      numeric,
  rating_count    integer,
  created_at      timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT mg.id, mg.source_game_id, mg.title, mg.description, mg.lang,
         mg.status, mg.moderation_note, mg.library_count, mg.avg_rating, mg.rating_count, mg.created_at
  FROM public.market_games mg
  WHERE mg.author_user_id = auth.uid() AND mg.status <> 'withdrawn'
  ORDER BY mg.created_at DESC;
$$;

NOTIFY pgrst, 'reload schema';
