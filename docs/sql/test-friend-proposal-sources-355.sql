-- Synthetic identities only; all changes roll back; no mail is queued.
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES ('friend:invite','pair',432000,true) ON CONFLICT DO NOTHING;
DO $$
DECLARE scenario text; proposal uuid; outcome jsonb;
 owner_id uuid:='aaaaaaaa-3551-0000-0000-000000000001';
 recipient uuid:='bbbbbbbb-3551-0000-0000-000000000002';
 source uuid:='cccccccc-3551-0000-0000-000000000003'; token uuid;
BEGIN
 FOREACH scenario IN ARRAY ARRAY['owner-cancel','hard-delete','recipient-unsub','accepted','manual-proposal','manual-reinvite','declined-source'] LOOP
  INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
   (owner_id,'owner355contract@example.invalid',false,'{"username":"owner355contract"}');
  INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status)
   VALUES(source,owner_id,'recipient355contract@example.invalid','active') RETURNING poll_subscriptions.token INTO token;
  INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
   (recipient,'recipient355contract@example.invalid',false,'{"username":"recipient355contract"}');
  IF scenario='manual-proposal' THEN
   INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES(owner_id,recipient,'pending');
  END IF;
  PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
  outcome:=public.friend_invites_from_subscriptions();
  IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'proposal creation %',outcome; END IF;
  SELECT id INTO proposal FROM public.friendships WHERE requester_id=owner_id AND addressee_id=recipient;
  IF scenario<>'manual-proposal' AND NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=proposal AND source_subscription_id=source)
   THEN RAISE EXCEPTION 'origin missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  IF public.friends_accept(proposal)->>'ok'='true' THEN RAISE EXCEPTION 'sender accepted own proposal'; END IF;
  PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
  UPDATE public.friendships SET email_send_count=1,email_sent_at=now() WHERE id=proposal;
  IF scenario='declined-source' THEN
   outcome:=public.friends_reject(proposal);
   IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'decline failed %',outcome; END IF;
  END IF;
  IF scenario='accepted' THEN
   outcome:=public.friends_accept(proposal);
   IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'accept failed %',outcome; END IF;
   IF EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE id=source) OR
    NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=proposal AND status='active' AND source_subscription_id IS NULL)
    THEN RAISE EXCEPTION 'accepted relation not independent'; END IF;
  ELSIF scenario='recipient-unsub' THEN
   outcome:=public.poll_sub_unsubscribe(token);
   IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'unsubscribe failed %',outcome; END IF;
  ELSIF scenario='hard-delete' THEN
   DELETE FROM public.poll_subscriptions WHERE id=source;
  ELSE
   PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
   outcome:=public.polls_hub_subscriber_remove(source);
   IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'cancel failed %',outcome; END IF;
  END IF;
  IF scenario IN('owner-cancel','hard-delete','recipient-unsub','manual-reinvite','declined-source') THEN
   IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=proposal AND cancelled_at IS NOT NULL AND email_send_count=1)
    THEN RAISE EXCEPTION 'source withdrawal did not cancel/preserve budget: %',scenario; END IF;
   PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
   IF public.friends_accept(proposal)->>'ok'='true' THEN RAISE EXCEPTION 'closed source accepted'; END IF;
  ELSIF scenario='manual-proposal' THEN
   IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=proposal AND cancelled_at IS NULL AND source_subscription_id IS NULL)
    THEN RAISE EXCEPTION 'independent manual proposal cancelled'; END IF;
  END IF;
  IF scenario='declined-source' THEN
   PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
   IF public.friends_undo_reject(proposal)->>'ok'='true' THEN RAISE EXCEPTION 'closed source refusal restored'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='friend:invite_after_reject'
     AND target_key='pair:'||owner_id||':'||recipient AND next_allowed_at>now()+interval '29 days')
    THEN RAISE EXCEPTION 'source withdrawal reset refusal clock'; END IF;
  END IF;
  IF scenario='manual-reinvite' THEN
   PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
   outcome:=public.friends_invite('recipient355contract@example.invalid');
   IF outcome->>'err' IS DISTINCT FROM 'cooldown' THEN RAISE EXCEPTION 'source cancellation reset invite cooldown %',outcome; END IF;
   UPDATE public.friendships SET email_sent_at=now()-interval '6 days' WHERE id=proposal;
   outcome:=public.friends_invite('recipient355contract@example.invalid');
   IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'manual new invite failed %',outcome; END IF;
   proposal:=(outcome->>'id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=proposal AND cancelled_at IS NULL AND source_subscription_id IS NULL AND email_send_count=2)
    THEN RAISE EXCEPTION 'manual invitation kept old origin or reset budget'; END IF;
   UPDATE public.poll_subscriptions SET cancelled_at=now() WHERE id=source;
   IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=proposal AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'old source cancelled independent new invite'; END IF;
  END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  DELETE FROM auth.users WHERE id IN(owner_id,recipient);
  RAISE NOTICE '355 proposal contract: % passed',scenario;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.friend_invites_from_subscriptions()->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'unauthenticated proposal creation'; END IF;
 IF has_function_privilege('authenticated','public._friend_source_closed()','EXECUTE')
 OR has_function_privilege('anon','public._friend_source_closed()','EXECUTE')
 THEN RAISE EXCEPTION 'private cascade helper exposed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
