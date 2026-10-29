-- Separate active polls with votes and subscription status counts in admin stats.
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
    SELECT count(*) AS total,
           count(*) FILTER (WHERE s.status = 'active') AS active,
           count(*) FILTER (WHERE s.status = 'pending') AS pending,
           count(*) FILTER (WHERE s.status = 'declined') AS declined,
           count(*) FILTER (WHERE s.status = 'cancelled') AS cancelled
    FROM public.poll_subscriptions s
    WHERE NOT (s.owner_id = ANY(excluded_ids))
  )
  SELECT jsonb_build_object(
    'games', jsonb_build_object(
      'total', (SELECT count(*) FROM eligible_games),
      'text', (SELECT count(*) FROM eligible_games WHERE type = 'poll_text'),
      'points', (SELECT count(*) FROM eligible_games WHERE type = 'poll_points'),
      'open', (SELECT count(*) FROM eligible_games WHERE status = 'poll_open'),
      'active', (SELECT count(*) FROM eligible_games WHERE status = 'poll_open'),
      'active_with_votes', (
        SELECT count(*) FROM eligible_games g
        WHERE g.status = 'poll_open'
          AND EXISTS (
            SELECT 1
            FROM answer_rows a
            JOIN public.poll_sessions s ON s.id = a.poll_session_id
            WHERE a.game_id = g.id AND s.game_id = g.id AND s.is_open
          )
      )
    ),
    'responses', jsonb_build_object(
      'total', (SELECT count(*) FROM answer_rows),
      'last_7d', (SELECT count(*) FROM answer_rows WHERE created_at >= now() - interval '7 days'),
      'voters', (SELECT count(*) FROM voters)
    ),
    'sharing', jsonb_build_object(
      'polls', (SELECT count(DISTINCT game_id) FROM task_rollup),
      'tasks', COALESCE((SELECT sum(tasks) FROM task_rollup), 0),
      'completed_tasks', COALESCE((SELECT sum(completed) FROM task_rollup), 0)
    ),
    'subscriptions', jsonb_build_object(
      'total', (SELECT total FROM subs),
      'active', (SELECT active FROM subs),
      'pending', (SELECT pending FROM subs),
      'declined', (SELECT declined FROM subs),
      'cancelled', (SELECT cancelled FROM subs)
    )
  ) INTO result;

  RETURN result;
END;
$$;
