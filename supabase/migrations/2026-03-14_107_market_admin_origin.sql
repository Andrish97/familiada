-- ============================================================
-- 107: market_admin_list/detail — dodaj origin i source_game_id
-- ============================================================

DROP FUNCTION IF EXISTS public.market_admin_list(text);
CREATE FUNCTION public.market_admin_list(p_status text DEFAULT 'pending'::text)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  lang text,
  status public.market_game_status,
  moderation_note text,
  library_count integer,
  author_username text,
  author_email text,
  storage_path text,
  created_at timestamptz,
  source_game_id uuid,
  origin text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mg.id,
    mg.title,
    mg.description,
    mg.lang,
    mg.status,
    mg.moderation_note,
    mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '') AS author_email,
    mg.storage_path,
    mg.created_at,
    mg.source_game_id,
    mg.origin::text AS origin
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = p_status::public.market_game_status
  ORDER BY mg.created_at ASC;
$$;

DROP FUNCTION IF EXISTS public.market_admin_detail(uuid);
CREATE FUNCTION public.market_admin_detail(p_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  lang text,
  status public.market_game_status,
  moderation_note text,
  library_count integer,
  author_username text,
  author_email text,
  storage_path text,
  payload jsonb,
  created_at timestamptz,
  source_game_id uuid,
  origin text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mg.id,
    mg.title,
    mg.description,
    mg.lang,
    mg.status,
    mg.moderation_note,
    mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '') AS author_email,
    mg.storage_path,
    mg.payload,
    mg.created_at,
    mg.source_game_id,
    mg.origin::text AS origin
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;
