-- Migration: Retention & activity stats
CREATE OR REPLACE FUNCTION public.get_retention_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  result jsonb;

  -- Activation
  total_confirmed bigint;
  activated       bigint;  -- confirmed users who created at least one non-demo game
  never_active    bigint;

  -- Activity segments (last game update per user)
  seg_active_7d   bigint;
  seg_active_8_30 bigint;
  seg_dormant     bigint;  -- last activity > 30 days ago
  seg_never       bigint;  -- no games at all

  -- D7 retention: registered >7d ago, had game activity in first 7 days (after day 0)
  d7_cohort   bigint;
  d7_returned bigint;

  -- D30 retention: registered >30d ago, had game activity in first 30 days (after day 0)
  d30_cohort   bigint;
  d30_returned bigint;

  -- New confirmed users per day, last 14 days
  trend_users jsonb;
BEGIN
  SELECT COUNT(*) INTO total_confirmed FROM public.profiles WHERE is_guest = false;

  -- Activation
  SELECT COUNT(DISTINCT g.owner_id) INTO activated
  FROM public.games g
  JOIN public.profiles p ON p.id = g.owner_id
  WHERE g.is_demo = false AND p.is_guest = false;

  never_active := total_confirmed - activated;

  -- Activity segments
  WITH last_activity AS (
    SELECT p.id, MAX(g.updated_at) AS last_updated
    FROM public.profiles p
    LEFT JOIN public.games g ON g.owner_id = p.id AND g.is_demo = false
    WHERE p.is_guest = false
    GROUP BY p.id
  )
  SELECT
    COUNT(CASE WHEN last_updated >= now() - interval '7 days'                                              THEN 1 END),
    COUNT(CASE WHEN last_updated <  now() - interval '7 days'  AND last_updated >= now() - interval '30 days' THEN 1 END),
    COUNT(CASE WHEN last_updated <  now() - interval '30 days'                                             THEN 1 END),
    COUNT(CASE WHEN last_updated IS NULL                                                                   THEN 1 END)
  INTO seg_active_7d, seg_active_8_30, seg_dormant, seg_never
  FROM last_activity;

  -- D7 retention
  WITH cohort AS (
    SELECT id, created_at AS reg_at
    FROM public.profiles
    WHERE is_guest = false AND created_at < now() - interval '7 days'
  )
  SELECT
    COUNT(*),
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.owner_id = c.id
        AND g.is_demo = false
        AND g.updated_at >= c.reg_at + interval '1 day'
        AND g.updated_at <= c.reg_at + interval '7 days'
    ) THEN 1 END)
  INTO d7_cohort, d7_returned
  FROM cohort c;

  -- D30 retention
  WITH cohort AS (
    SELECT id, created_at AS reg_at
    FROM public.profiles
    WHERE is_guest = false AND created_at < now() - interval '30 days'
  )
  SELECT
    COUNT(*),
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.owner_id = c.id
        AND g.is_demo = false
        AND g.updated_at >= c.reg_at + interval '1 day'
        AND g.updated_at <= c.reg_at + interval '30 days'
    ) THEN 1 END)
  INTO d30_cohort, d30_returned
  FROM cohort c;

  -- Trend: new confirmed users per day, last 14 days
  SELECT jsonb_agg(jsonb_build_object('day', day::text, 'count', count) ORDER BY day)
  INTO trend_users
  FROM (
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM public.profiles
    WHERE is_guest = false AND created_at >= CURRENT_DATE - interval '13 days'
    GROUP BY DATE(created_at)
  ) sub;

  result := jsonb_build_object(
    'activation', jsonb_build_object(
      'total',       total_confirmed,
      'activated',   activated,
      'never_active', never_active
    ),
    'segments', jsonb_build_object(
      'active_7d',    seg_active_7d,
      'active_8_30d', seg_active_8_30,
      'dormant',      seg_dormant,
      'never',        seg_never
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
