-- Admin-only poll analytics. Poll answers are stored per question, so expose
-- both answer-row totals and distinct voter tokens per poll/game.

CREATE OR REPLACE FUNCTION public.get_admin_poll_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  excluded_ids uuid[];
  result jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  WITH eligible_games AS (
    SELECT g.id, g.owner_id, g.type::text AS type, g.status::text AS status
    FROM public.games g
    WHERE g.type IN ('poll_text', 'poll_points')
      AND g.is_demo = false
      AND g.source_market_id IS NULL
      AND NOT (g.owner_id = ANY(excluded_ids))
  ),
  answer_rows AS (
    SELECT v.game_id, v.poll_session_id, v.voter_token, v.created_at
    FROM public.poll_votes v
    JOIN eligible_games g ON g.id = v.game_id
    UNION ALL
    SELECT e.game_id, e.poll_session_id, e.voter_token, e.created_at
    FROM public.poll_text_entries e
    JOIN eligible_games g ON g.id = e.game_id
  ),
  voters AS (
    SELECT DISTINCT game_id, voter_token FROM answer_rows
  ),
  task_rollup AS (
    SELECT t.game_id, count(*) AS tasks,
           count(*) FILTER (WHERE t.status = 'done') AS completed
    FROM public.poll_tasks t
    JOIN eligible_games g ON g.id = t.game_id
    GROUP BY t.game_id
  ),
  subs AS (
    SELECT count(*) FILTER (WHERE s.status = 'active') AS active,
           count(*) FILTER (WHERE s.status = 'pending') AS pending
    FROM public.poll_subscriptions s
    WHERE NOT (s.owner_id = ANY(excluded_ids))
  )
  SELECT jsonb_build_object(
    'games', jsonb_build_object(
      'total', (SELECT count(*) FROM eligible_games),
      'text', (SELECT count(*) FROM eligible_games WHERE type = 'poll_text'),
      'points', (SELECT count(*) FROM eligible_games WHERE type = 'poll_points'),
      'open', (SELECT count(*) FROM eligible_games WHERE status = 'poll_open')
    ),
    'responses', jsonb_build_object(
      'total', (SELECT count(*) FROM answer_rows),
      'last_7d', (SELECT count(*) FROM answer_rows WHERE created_at >= now() - interval '7 days'),
      'voters', (SELECT count(*) FROM voters)
    ),
    'sessions', jsonb_build_object(
      'total', (SELECT count(*) FROM public.poll_sessions s JOIN eligible_games g ON g.id = s.game_id),
      'open', (SELECT count(*) FROM public.poll_sessions s JOIN eligible_games g ON g.id = s.game_id WHERE s.is_open)
    ),
    'sharing', jsonb_build_object(
      'polls', (SELECT count(DISTINCT game_id) FROM task_rollup),
      'tasks', COALESCE((SELECT sum(tasks) FROM task_rollup), 0),
      'completed_tasks', COALESCE((SELECT sum(completed) FROM task_rollup), 0),
      'active_subscribers', (SELECT active FROM subs),
      'pending_subscribers', (SELECT pending FROM subs)
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_poll_details(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  excluded_ids uuid[];
  result jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  WITH eligible_games AS (
    SELECT g.id, g.name, g.type::text AS type, g.status::text AS status,
           g.owner_id, g.created_at, p.username AS owner
    FROM public.games g
    LEFT JOIN public.profiles p ON p.id = g.owner_id
    WHERE g.type IN ('poll_text', 'poll_points')
      AND g.is_demo = false
      AND g.source_market_id IS NULL
      AND NOT (g.owner_id = ANY(excluded_ids))
  ),
  answers AS (
    SELECT v.game_id, v.poll_session_id, v.voter_token
    FROM public.poll_votes v JOIN eligible_games g ON g.id = v.game_id
    UNION ALL
    SELECT e.game_id, e.poll_session_id, e.voter_token
    FROM public.poll_text_entries e JOIN eligible_games g ON g.id = e.game_id
  ),
  answer_counts AS (
    SELECT game_id, count(*) AS responses,
           count(DISTINCT voter_token) AS voters
    FROM answers GROUP BY game_id
  ),
  task_counts AS (
    SELECT game_id, count(*) AS shared_tasks,
           count(*) FILTER (WHERE status = 'done') AS completed_tasks
    FROM public.poll_tasks GROUP BY game_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT g.name, g.type, g.status, g.owner, g.created_at,
           COALESCE(a.responses, 0) AS responses,
           COALESCE(a.voters, 0) AS voters,
           COALESCE(t.shared_tasks, 0) AS shared_tasks,
           COALESCE(t.completed_tasks, 0) AS completed_tasks
    FROM eligible_games g
    LEFT JOIN answer_counts a ON a.game_id = g.id
    LEFT JOIN task_counts t ON t.game_id = g.id
    ORDER BY g.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
  ) AS row_data;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_poll_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_poll_details(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_poll_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_poll_details(integer) TO service_role;
