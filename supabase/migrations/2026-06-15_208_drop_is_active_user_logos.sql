-- 208: Drop is_active from user_logos
--
-- is_active was a "global active logo per user" flag — now useless.
-- Each game stores its logo in games.settings->>'display'->>'logoId' (migration 206).
-- Removes: column, unique index, two RPCs, fallback in display_logo_get_public,
--          logos_active counter in get_admin_stats, column in get_stats_detail.

-- 1. Drop RPCs that read/write is_active
DROP FUNCTION IF EXISTS public.user_logo_set_active(uuid);
DROP FUNCTION IF EXISTS public.user_logo_clear_active();

-- 2. Drop partial unique index (requires is_active column)
DROP INDEX IF EXISTS public.user_logos_one_active_per_user;

-- 3. Drop the column
ALTER TABLE public.user_logos DROP COLUMN IF EXISTS is_active;

-- 4. Update display_logo_get_public — remove is_active fallback; return null when no per-game logo
CREATE OR REPLACE FUNCTION public.display_logo_get_public(p_game_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_owner    uuid;
  v_ok       boolean;
  v_logo_id  uuid;
  v_logo     jsonb;
begin
  select (g.share_key_display = p_key),
         g.owner_id,
         (g.settings -> 'display' ->> 'logoId')::uuid
    into v_ok, v_owner, v_logo_id
  from public.games g
  where g.id = p_game_id;

  if v_ok is distinct from true then
    return null;
  end if;

  if v_logo_id is not null then
    select jsonb_build_object('type', ul.type, 'payload', ul.payload, 'name', ul.name)
      into v_logo
    from public.user_logos ul
    where ul.id = v_logo_id and ul.user_id = v_owner;
  end if;

  return v_logo;
end $$;

-- 5. Update get_admin_stats — remove logos_active
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];

  total_users      bigint;
  confirmed_users  bigint;
  guest_users      bigint;
  users_new_today  bigint;
  users_new_7d     bigint;
  users_new_30d    bigint;
  users_pl bigint; users_en bigint; users_uk bigint;

  total_games      bigint;
  games_ready      bigint;
  games_new_today  bigint;
  games_new_7d     bigint;
  games_new_30d    bigint;
  avg_questions    numeric;

  played_today  bigint;
  played_7d     bigint;
  played_30d    bigint;
  buzzer_7d     bigint;

  poll_sessions_7d  bigint;
  poll_votes_7d     bigint;
  poll_votes_total  bigint;

  bases_total    bigint;
  bases_new_today bigint;
  bases_new_7d   bigint;
  bases_new_30d  bigint;

  logos_total    bigint;
  logos_new_today bigint;
  logos_new_7d   bigint;
  logos_new_30d  bigint;

  mail_errors_24h  bigint;

  total_ratings    bigint;
  avg_rating       numeric;
  ratings_new_today bigint;
  ratings_new_7d   bigint;
  ratings_new_30d  bigint;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  -- Users
  SELECT COUNT(*) INTO total_users     FROM public.profiles WHERE NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO guest_users     FROM public.profiles WHERE is_guest = true  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_today FROM public.profiles WHERE created_at >= CURRENT_DATE                AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_7d    FROM public.profiles WHERE created_at >= now() - interval '7 days'  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_30d   FROM public.profiles WHERE created_at >= now() - interval '30 days' AND NOT (id = ANY(excluded_ids));

  SELECT COUNT(*) INTO users_pl FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'pl' AND NOT (u.id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_en FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'en' AND NOT (u.id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_uk FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'uk' AND NOT (u.id = ANY(excluded_ids));

  -- Games
  SELECT COUNT(*) INTO total_games      FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_ready      FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND status = 'ready' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_today  FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= CURRENT_DATE AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_7d     FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_30d    FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= now() - interval '30 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COALESCE(AVG(jsonb_array_length(g.questions)), 0) INTO avg_questions
    FROM public.games g WHERE g.is_demo = false AND source_market_id IS NULL AND NOT (g.owner_id = ANY(excluded_ids));

  -- Gameplay
  SELECT COUNT(*) INTO played_today FROM public.game_sessions WHERE started_at >= CURRENT_DATE;
  SELECT COUNT(*) INTO played_7d    FROM public.game_sessions WHERE started_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO played_30d   FROM public.game_sessions WHERE started_at >= now() - interval '30 days';
  SELECT COUNT(*) INTO buzzer_7d    FROM public.game_sessions WHERE started_at >= now() - interval '7 days' AND session_type = 'buzzer';

  -- Polls
  SELECT COUNT(*) INTO poll_sessions_7d FROM public.poll_sessions WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO poll_votes_7d    FROM public.poll_votes    WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO poll_votes_total FROM public.poll_votes;

  -- Question bases
  SELECT COUNT(*) INTO bases_total     FROM public.question_bases WHERE is_demo = false AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_today FROM public.question_bases WHERE is_demo = false AND created_at >= CURRENT_DATE AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_7d    FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_30d   FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '30 days' AND NOT (owner_id = ANY(excluded_ids));

  -- User logos
  SELECT COUNT(*) INTO logos_total     FROM public.user_logos WHERE is_demo = false AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_today FROM public.user_logos WHERE is_demo = false AND created_at >= CURRENT_DATE AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_7d    FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_30d   FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '30 days' AND NOT (user_id = ANY(excluded_ids));

  -- Health
  BEGIN
    SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue
      WHERE status = 'failed' AND updated_at >= now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    mail_errors_24h := 0;
  END;

  -- Ratings
  SELECT COUNT(*) INTO total_ratings     FROM public.app_ratings;
  SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;
  SELECT COUNT(*) INTO ratings_new_today FROM public.app_ratings WHERE created_at >= CURRENT_DATE;
  SELECT COUNT(*) INTO ratings_new_7d    FROM public.app_ratings WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO ratings_new_30d   FROM public.app_ratings WHERE created_at >= now() - interval '30 days';

  result := jsonb_build_object(
    'users', jsonb_build_object(
      'total', total_users, 'confirmed', confirmed_users, 'guests', guest_users,
      'new_today', users_new_today, 'new_7d', users_new_7d, 'new_30d', users_new_30d,
      'langs', jsonb_build_object('pl', users_pl, 'en', users_en, 'uk', users_uk)
    ),
    'games', jsonb_build_object(
      'total', total_games, 'ready', games_ready,
      'new_today', games_new_today, 'new_7d', games_new_7d, 'new_30d', games_new_30d,
      'avg_q', avg_questions
    ),
    'gameplay', jsonb_build_object(
      'played_today', played_today, 'played_7d', played_7d,
      'played_30d', played_30d, 'buzzer_7d', buzzer_7d
    ),
    'polls', jsonb_build_object(
      'sessions_7d', poll_sessions_7d, 'votes_7d', poll_votes_7d, 'votes_total', poll_votes_total
    ),
    'bases', jsonb_build_object(
      'total', bases_total,
      'new_today', bases_new_today, 'new_7d', bases_new_7d, 'new_30d', bases_new_30d
    ),
    'logos', jsonb_build_object(
      'total', logos_total,
      'new_today', logos_new_today, 'new_7d', logos_new_7d, 'new_30d', logos_new_30d
    ),
    'health',   jsonb_build_object('mail_errors', mail_errors_24h),
    'ratings',  jsonb_build_object(
      'total', total_ratings, 'average', avg_rating,
      'new_today', ratings_new_today, 'new_7d', ratings_new_7d, 'new_30d', ratings_new_30d
    ),
    'timestamp', now()
  );
  RETURN result;
END;
$$;

-- 6. Update get_stats_detail — remove is_active from logos case
CREATE OR REPLACE FUNCTION public.get_stats_detail(p_type text, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
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
