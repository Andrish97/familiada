-- Migration: Fix missing is_demo=false filter for question_bases and user_logos in get_admin_stats
-- SUPERSEDES: 2026-03-27_163_stats_bases_logos.sql
CREATE OR REPLACE FUNCTION "public"."get_admin_stats"()
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public', 'auth'
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

  total_games   bigint;
  games_ready   bigint;
  games_new_7d  bigint;
  avg_questions numeric;

  played_today  bigint;
  played_7d     bigint;
  played_30d    bigint;
  buzzer_7d     bigint;

  poll_sessions_7d  bigint;
  poll_votes_7d     bigint;
  poll_votes_total  bigint;

  bases_total   bigint;
  bases_new_7d  bigint;

  logos_total   bigint;
  logos_active  bigint;
  logos_new_7d  bigint;

  mail_errors_24h bigint;
  total_ratings   bigint;
  avg_rating      numeric;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  -- Users
  SELECT COUNT(*) INTO total_users     FROM public.profiles WHERE NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO guest_users     FROM public.profiles WHERE is_guest = true  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_today FROM public.profiles WHERE created_at >= CURRENT_DATE                AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_7d    FROM public.profiles WHERE created_at >= now() - interval '7 days'  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_30d   FROM public.profiles WHERE created_at >= now() - interval '30 days' AND NOT (id = ANY(excluded_ids));

  BEGIN
    SELECT COUNT(*) INTO users_pl FROM public.profiles WHERE language = 'pl' AND NOT (id = ANY(excluded_ids));
    SELECT COUNT(*) INTO users_en FROM public.profiles WHERE language = 'en' AND NOT (id = ANY(excluded_ids));
    SELECT COUNT(*) INTO users_uk FROM public.profiles WHERE language = 'uk' AND NOT (id = ANY(excluded_ids));
  EXCEPTION WHEN OTHERS THEN
    users_pl := 0; users_en := 0; users_uk := 0;
  END;

  -- Games
  SELECT COUNT(*) INTO total_games  FROM public.games WHERE is_demo = false AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_ready  FROM public.games WHERE is_demo = false AND status = 'ready' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_7d FROM public.games WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COALESCE(ROUND(AVG(q_count), 1), 0) INTO avg_questions
    FROM (SELECT COUNT(*) AS q_count FROM public.questions q
          JOIN public.games g ON g.id = q.game_id
          WHERE g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids))
          GROUP BY q.game_id) AS sub;

  -- Gameplay
  SELECT COUNT(DISTINCT dp.game_id) INTO played_today FROM public.device_presence dp
    JOIN public.games g ON g.id = dp.game_id
    WHERE dp.device_type = 'display' AND dp.last_seen_at >= CURRENT_DATE AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(DISTINCT dp.game_id) INTO played_7d FROM public.device_presence dp
    JOIN public.games g ON g.id = dp.game_id
    WHERE dp.device_type = 'display' AND dp.last_seen_at >= now() - interval '7 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(DISTINCT dp.game_id) INTO played_30d FROM public.device_presence dp
    JOIN public.games g ON g.id = dp.game_id
    WHERE dp.device_type = 'display' AND dp.last_seen_at >= now() - interval '30 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(DISTINCT dp.game_id) INTO buzzer_7d FROM public.device_presence dp
    JOIN public.games g ON g.id = dp.game_id
    WHERE dp.device_type = 'buzzer' AND dp.last_seen_at >= now() - interval '7 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));

  -- Polls
  SELECT COUNT(*) INTO poll_sessions_7d FROM public.poll_sessions ps
    JOIN public.games g ON g.id = ps.game_id
    WHERE ps.created_at >= now() - interval '7 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO poll_votes_7d FROM public.poll_votes pv
    JOIN public.games g ON g.id = pv.game_id
    WHERE pv.created_at >= now() - interval '7 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO poll_votes_total FROM public.poll_votes pv
    JOIN public.games g ON g.id = pv.game_id
    WHERE g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));

  -- Question bases (bez demo)
  SELECT COUNT(*) INTO bases_total  FROM public.question_bases WHERE is_demo = false AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_7d FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));

  -- User logos (bez demo)
  SELECT COUNT(*) INTO logos_total  FROM public.user_logos WHERE is_demo = false AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_active FROM public.user_logos WHERE is_demo = false AND is_active = true AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_7d FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (user_id = ANY(excluded_ids));

  -- Health
  BEGIN
    SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue
      WHERE status = 'failed' AND updated_at >= now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    mail_errors_24h := 0;
  END;

  -- Ratings
  SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
  SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;

  result := jsonb_build_object(
    'users', jsonb_build_object(
      'total', total_users, 'confirmed', confirmed_users, 'guests', guest_users,
      'new_today', users_new_today, 'new_7d', users_new_7d, 'new_30d', users_new_30d,
      'langs', jsonb_build_object('pl', users_pl, 'en', users_en, 'uk', users_uk)
    ),
    'games', jsonb_build_object(
      'total', total_games, 'ready', games_ready, 'new_7d', games_new_7d, 'avg_q', avg_questions
    ),
    'gameplay', jsonb_build_object(
      'played_today', played_today, 'played_7d', played_7d,
      'played_30d', played_30d, 'buzzer_7d', buzzer_7d
    ),
    'polls', jsonb_build_object(
      'sessions_7d', poll_sessions_7d, 'votes_7d', poll_votes_7d, 'votes_total', poll_votes_total
    ),
    'bases', jsonb_build_object(
      'total', bases_total, 'new_7d', bases_new_7d
    ),
    'logos', jsonb_build_object(
      'total', logos_total, 'active', logos_active, 'new_7d', logos_new_7d
    ),
    'health',   jsonb_build_object('mail_errors', mail_errors_24h),
    'ratings',  jsonb_build_object('total', total_ratings, 'average', avg_rating),
    'timestamp', now()
  );
  RETURN result;
END;
$$;
