-- 175: Add language to get_stats_detail users — read from auth.users.raw_user_meta_data
CREATE OR REPLACE FUNCTION "public"."get_stats_detail"(p_type text, p_limit int DEFAULT 200)
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public', 'auth'
AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  CASE p_type

  WHEN 'users' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        p.username,
        p.email,
        lower(u.raw_user_meta_data->>'language') AS language,
        p.is_guest,
        p.created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE NOT (p.id = ANY(excluded_ids))
      ORDER BY p.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'games' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name,
        g.type,
        g.status,
        pr.username AS owner,
        g.created_at
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE g.is_demo = false
        AND g.source_market_id IS NULL
        AND NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'gameplay' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name AS game_name,
        pr.username AS owner,
        MAX(dp.last_seen_at) AS last_seen_at
      FROM public.device_presence dp
      JOIN public.games g ON g.id = dp.game_id
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE dp.device_type = 'display'
        AND g.is_demo = false
        AND NOT (g.owner_id = ANY(excluded_ids))
      GROUP BY g.id, g.name, pr.username
      ORDER BY MAX(dp.last_seen_at) DESC
      LIMIT p_limit
    ) r;

  WHEN 'bases' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        b.name,
        pr.username AS owner,
        b.created_at
      FROM public.question_bases b
      LEFT JOIN public.profiles pr ON pr.id = b.owner_id
      WHERE b.is_demo = false
        AND NOT (b.owner_id = ANY(excluded_ids))
      ORDER BY b.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'logos' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        l.name,
        l.type,
        l.is_active,
        pr.username AS owner,
        l.created_at
      FROM public.user_logos l
      LEFT JOIN public.profiles pr ON pr.id = l.user_id
      WHERE l.is_demo = false
        AND NOT (l.user_id = ANY(excluded_ids))
      ORDER BY l.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'ratings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        pr.username,
        rt.stars,
        rt.comment,
        rt.created_at
      FROM public.app_ratings rt
      LEFT JOIN public.profiles pr ON pr.id = rt.user_id
      ORDER BY rt.created_at DESC
      LIMIT p_limit
    ) r;

  ELSE
    result := '[]'::jsonb;
  END CASE;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';
