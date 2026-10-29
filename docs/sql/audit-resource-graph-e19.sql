-- Read-only aggregate audit. Never log identities, addresses, tokens or answers.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';
SET LOCAL search_path=public,pg_temp;
DO $$
DECLARE counts jsonb; violations bigint;
BEGIN
 WITH votes AS (
  SELECT game_id,voter_token,count(DISTINCT question_id) AS answers
  FROM (SELECT game_id,voter_token,question_id FROM public.poll_text_entries
        UNION ALL SELECT game_id,voter_token,question_id FROM public.poll_votes) v
  WHERE left(voter_token,5)='task:' GROUP BY game_id,voter_token
 ), checks AS (
  SELECT 'poll_current_parent' name,count(*) total FROM public.poll_tasks t
   LEFT JOIN public.games g ON g.id=t.game_id
   WHERE t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND (g.id IS NULL OR (g.status::text IN('poll_open','poll_stopped') AND
      (t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll OR t.poll_type IS DISTINCT FROM g.type::text)))
  UNION ALL
  SELECT 'base_pending_parent',count(*) FROM public.base_share_tasks t
   LEFT JOIN public.question_bases b ON b.id=t.base_id
   WHERE t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND (b.id IS NULL OR t.owner_id IS DISTINCT FROM b.owner_id)
  UNION ALL
  SELECT 'control_session_parent',count(*) FROM public.control_runtime_sessions s
   LEFT JOIN public.games g ON g.id=s.game_id
   WHERE s.ended_at IS NULL AND s.expires_at>now() AND (g.id IS NULL OR s.owner_id IS DISTINCT FROM g.owner_id)
  UNION ALL
  SELECT 'device_grant_parent',count(*) FROM public.control_device_shares d
   LEFT JOIN public.control_runtime_sessions s ON s.id=d.session_id
   WHERE s.id IS NULL OR d.owner_id IS DISTINCT FROM s.owner_id OR d.game_id IS DISTINCT FROM s.game_id
  UNION ALL
  SELECT 'incomplete_task_votes_without_access',count(*) FROM votes v
   LEFT JOIN public.poll_tasks t ON t.game_id=v.game_id AND t.id::text=substring(v.voter_token FROM 6)
   WHERE v.answers<(SELECT count(*) FROM public.questions q WHERE q.game_id=v.game_id)
    AND (t.id IS NULL OR t.status NOT IN('pending','opened') OR t.cancelled_at IS NOT NULL
      OR t.declined_at IS NOT NULL OR NOT public._poll_task_source_active(t))
  UNION ALL
  SELECT 'anonymous_clock_parent',count(*) FROM public.poll_anonymous_limits l
   LEFT JOIN public.games g ON g.id=l.game_id
   WHERE g.id IS NULL OR g.status::text<>'poll_open' OR g.type::text NOT IN('poll_text','poll_points')
    OR l.key_hash IS DISTINCT FROM public._poll_anon_hash(g.id,g.share_key_poll,'key')
    OR l.in_progress OR l.voter_hash IS NULL OR l.payload_hash IS NULL
  UNION ALL
  SELECT 'mail_center_link_root',count(*) FROM public.mail_center_links l
   LEFT JOIN public.email_unsub_tokens root ON root.token=l.root_token
   WHERE root.token IS NULL OR public._norm_email(root.email) IS DISTINCT FROM l.email
  UNION ALL
  SELECT 'mail_center_session_link',count(*) FROM public.mail_center_sessions s
   LEFT JOIN public.mail_center_links l ON l.id=s.link_id WHERE l.id IS NULL
  UNION ALL
  SELECT 'mail_allocation_kind_pointer',count(*) FROM public.mail_notification_allocations a
   WHERE CASE a.source_kind WHEN 'friend' THEN a.friendship_id WHEN 'subscription' THEN a.subscription_id
    WHEN 'poll' THEN a.poll_task_id WHEN 'base' THEN a.base_task_id WHEN 'device' THEN a.device_share_id END IS NULL
  UNION ALL
  SELECT 'pending_notification_allocation',count(*) FROM public.mail_queue q
   LEFT JOIN public.mail_notification_allocations a ON a.id=q.notification_allocation_id
   WHERE q.status='pending' AND q.notification_source_kind IS NOT NULL
    AND (a.id IS NULL OR a.consumed_queue_id IS DISTINCT FROM q.id OR a.consumed_at IS NULL
      OR a.source_kind IS DISTINCT FROM q.notification_source_kind OR a.source_token IS DISTINCT FROM q.notification_source_token)
  UNION ALL
  SELECT 'private_graph_table_permissions',count(*) FROM unnest(ARRAY[
   'poll_anonymous_limits','mail_center_links','mail_center_sessions','mail_notification_allocations']) relation
   CROSS JOIN unnest(ARRAY['anon','authenticated']) role_name
   WHERE has_table_privilege(role_name,'public.'||relation,'SELECT')
    OR has_table_privilege(role_name,'public.'||relation,'INSERT') OR has_table_privilege(role_name,'public.'||relation,'UPDATE')
    OR has_table_privilege(role_name,'public.'||relation,'DELETE')
    OR has_any_column_privilege(role_name,'public.'||relation,'SELECT')
    OR has_any_column_privilege(role_name,'public.'||relation,'INSERT')
    OR has_any_column_privilege(role_name,'public.'||relation,'UPDATE')
 ) SELECT jsonb_object_agg(name,total),sum(total) INTO counts,violations FROM checks;
 RAISE NOTICE 'E19 graph counts: %',counts;
 IF violations>0 THEN RAISE EXCEPTION 'E19 graph audit found % violations (aggregate counts above)',violations; END IF;
END $$;
ROLLBACK;
