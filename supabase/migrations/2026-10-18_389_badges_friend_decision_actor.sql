-- The active friend relation can be ended by either party. After a refusal,
-- decision_user_id identifies who may undo it and accept the restored request;
-- badges_get must count the same incoming queue as friends_list().
BEGIN;

CREATE OR REPLACE FUNCTION public.badges_get()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  identity jsonb;
  polls integer;
  bases integer;
  friends integer;
BEGIN
  SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id = uid;
  IF NOT public._account_is_registered(uid, identity) THEN
    RETURN jsonb_build_object('tasks_pending', 0, 'friends_pending', 0);
  END IF;

  PERFORM public.poll_claim_email_records();
  SELECT count(*) INTO polls
  FROM public.poll_tasks t
  WHERE t.recipient_user_id = uid
    AND t.done_at IS NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL;
  SELECT count(*) INTO bases
  FROM public.base_share_tasks bt
  WHERE bt.recipient_user_id = uid AND bt.status IN ('pending', 'opened');
  SELECT count(*) INTO friends
  FROM public.friendships f
  WHERE f.decision_user_id = uid AND f.status = 'pending' AND f.cancelled_at IS NULL;

  RETURN jsonb_build_object('tasks_pending', polls + bases, 'friends_pending', friends);
END;
$$;

COMMIT;
