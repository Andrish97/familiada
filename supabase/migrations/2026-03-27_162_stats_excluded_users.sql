-- Migration: Stats exclusion list + funnel level 3 (real gameplay)

-- Tabela wykluczonych z statystyk (np. konta admina)
CREATE TABLE IF NOT EXISTS public.stats_excluded_users (
  user_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now() NOT NULL
);

-- Dodaj użytkownika do wykluczonych (po username)
CREATE OR REPLACE FUNCTION public.stats_exclude_user(p_username text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE username = p_username LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;

  INSERT INTO public.stats_excluded_users (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Usuń użytkownika z wykluczonych
CREATE OR REPLACE FUNCTION public.stats_unexclude_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.stats_excluded_users WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Lista wykluczonych z danymi profilu
CREATE OR REPLACE FUNCTION public.stats_excluded_list()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',  e.user_id,
    'username', p.username,
    'email',    p.email,
    'added_at', e.added_at
  ) ORDER BY e.added_at), '[]'::jsonb)
  INTO result
  FROM public.stats_excluded_users e
  JOIN public.profiles p ON p.id = e.user_id;

  RETURN result;
END;
$$;

-- Zaktualizowany get_admin_stats z filtrem wykluczonych i bez demo
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

  mail_errors_24h bigint;
  total_ratings   bigint;
  avg_rating      numeric;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  SELECT COUNT(*) INTO total_users     FROM public.profiles WHERE NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO guest_users     FROM public.profiles WHERE is_guest = true  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_today FROM public.profiles WHERE created_at >= CURRENT_DATE                    AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_7d    FROM public.profiles WHERE created_at >= now() - interval '7 days'      AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_30d   FROM public.profiles WHERE created_at >= now() - interval '30 days'     AND NOT (id = ANY(excluded_ids));

  BEGIN
    SELECT COUNT(*) INTO users_pl FROM public.profiles WHERE language = 'pl' AND NOT (id = ANY(excluded_ids));
    SELECT COUNT(*) INTO users_en FROM public.profiles WHERE language = 'en' AND NOT (id = ANY(excluded_ids));
    SELECT COUNT(*) INTO users_uk FROM public.profiles WHERE language = 'uk' AND NOT (id = ANY(excluded_ids));
  EXCEPTION WHEN OTHERS THEN
    users_pl := 0; users_en := 0; users_uk := 0;
  END;

  SELECT COUNT(*) INTO total_games  FROM public.games WHERE is_demo = false AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_ready  FROM public.games WHERE is_demo = false AND status = 'ready' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_7d FROM public.games WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COALESCE(ROUND(AVG(q_count), 1), 0) INTO avg_questions
    FROM (SELECT COUNT(*) AS q_count FROM public.questions q
          JOIN public.games g ON g.id = q.game_id
          WHERE g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids))
          GROUP BY q.game_id) AS sub;

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

  SELECT COUNT(*) INTO poll_sessions_7d FROM public.poll_sessions ps
    JOIN public.games g ON g.id = ps.game_id
    WHERE ps.created_at >= now() - interval '7 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO poll_votes_7d FROM public.poll_votes pv
    JOIN public.games g ON g.id = pv.game_id
    WHERE pv.created_at >= now() - interval '7 days' AND g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO poll_votes_total FROM public.poll_votes pv
    JOIN public.games g ON g.id = pv.game_id
    WHERE g.is_demo = false AND NOT (g.owner_id = ANY(excluded_ids));

  BEGIN
    SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue
      WHERE status = 'failed' AND updated_at >= now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    mail_errors_24h := 0;
  END;

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
    'health',   jsonb_build_object('mail_errors', mail_errors_24h),
    'ratings',  jsonb_build_object('total', total_ratings, 'average', avg_rating),
    'timestamp', now()
  );
  RETURN result;
END;
$$;

-- Zaktualizowany get_retention_stats z filtrem wykluczonych + lejek 3-poziomowy
CREATE OR REPLACE FUNCTION public.get_retention_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];

  total_confirmed bigint;
  activated       bigint;
  real_activated  bigint;  -- uruchomili rozgrywkę (display connected, non-demo)
  never_active    bigint;

  seg_active_7d   bigint;
  seg_active_8_30 bigint;
  seg_dormant     bigint;
  seg_never       bigint;

  d7_cohort   bigint; d7_returned   bigint;
  d30_cohort  bigint; d30_returned  bigint;

  trend_users jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  SELECT COUNT(*) INTO total_confirmed
    FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));

  -- Poziom 2: stworzyli własną grę
  SELECT COUNT(DISTINCT g.owner_id) INTO activated
    FROM public.games g JOIN public.profiles p ON p.id = g.owner_id
    WHERE g.is_demo = false AND p.is_guest = false AND NOT (p.id = ANY(excluded_ids));

  -- Poziom 3: uruchomili rozgrywkę (display połączony z ich grą)
  SELECT COUNT(DISTINCT g.owner_id) INTO real_activated
    FROM public.device_presence dp
    JOIN public.games g ON g.id = dp.game_id
    JOIN public.profiles p ON p.id = g.owner_id
    WHERE dp.device_type = 'display' AND g.is_demo = false
      AND p.is_guest = false AND NOT (p.id = ANY(excluded_ids));

  never_active := total_confirmed - activated;

  -- Segmenty (ostatnia aktywność = last game update)
  WITH last_activity AS (
    SELECT p.id, MAX(g.updated_at) AS last_updated
    FROM public.profiles p
    LEFT JOIN public.games g ON g.owner_id = p.id AND g.is_demo = false
    WHERE p.is_guest = false AND NOT (p.id = ANY(excluded_ids))
    GROUP BY p.id
  )
  SELECT
    COUNT(CASE WHEN last_updated >= now() - interval '7 days' THEN 1 END),
    COUNT(CASE WHEN last_updated <  now() - interval '7 days' AND last_updated >= now() - interval '30 days' THEN 1 END),
    COUNT(CASE WHEN last_updated <  now() - interval '30 days' THEN 1 END),
    COUNT(CASE WHEN last_updated IS NULL THEN 1 END)
  INTO seg_active_7d, seg_active_8_30, seg_dormant, seg_never
  FROM last_activity;

  -- D7 retention
  WITH cohort AS (
    SELECT id, created_at AS reg_at FROM public.profiles
    WHERE is_guest = false AND created_at < now() - interval '7 days' AND NOT (id = ANY(excluded_ids))
  )
  SELECT COUNT(*),
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM public.games g WHERE g.owner_id = c.id AND g.is_demo = false
        AND g.updated_at >= c.reg_at + interval '1 day' AND g.updated_at <= c.reg_at + interval '7 days'
    ) THEN 1 END)
  INTO d7_cohort, d7_returned FROM cohort c;

  -- D30 retention
  WITH cohort AS (
    SELECT id, created_at AS reg_at FROM public.profiles
    WHERE is_guest = false AND created_at < now() - interval '30 days' AND NOT (id = ANY(excluded_ids))
  )
  SELECT COUNT(*),
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM public.games g WHERE g.owner_id = c.id AND g.is_demo = false
        AND g.updated_at >= c.reg_at + interval '1 day' AND g.updated_at <= c.reg_at + interval '30 days'
    ) THEN 1 END)
  INTO d30_cohort, d30_returned FROM cohort c;

  -- Trend 14 dni
  SELECT jsonb_agg(jsonb_build_object('day', day::text, 'count', count) ORDER BY day)
  INTO trend_users
  FROM (
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM public.profiles
    WHERE is_guest = false AND created_at >= CURRENT_DATE - interval '13 days'
      AND NOT (id = ANY(excluded_ids))
    GROUP BY DATE(created_at)
  ) sub;

  result := jsonb_build_object(
    'funnel', jsonb_build_object(
      'registered',     total_confirmed,
      'game_created',   activated,
      'game_played',    real_activated,
      'never_active',   never_active
    ),
    'segments', jsonb_build_object(
      'active_7d', seg_active_7d, 'active_8_30d', seg_active_8_30,
      'dormant', seg_dormant, 'never', seg_never
    ),
    'retention', jsonb_build_object(
      'd7',  jsonb_build_object('cohort', d7_cohort,  'returned', d7_returned),
      'd30', jsonb_build_object('cohort', d30_cohort, 'returned', d30_returned)
    ),
    'trend_users', COALESCE(trend_users, '[]'::jsonb),
    'timestamp', now()
  );
  RETURN result;
END;
$$;
