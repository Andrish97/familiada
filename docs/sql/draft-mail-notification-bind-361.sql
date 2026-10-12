-- LOCAL DRAFT. Root locks before allocation and queue; no child-first waits.
CREATE OR REPLACE FUNCTION public._mail_notification_source_lock_prototype(q public.mail_queue)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE before_info jsonb; after_info jsonb; ids uuid[]; mails text[]; mailbox text; f public.friendships; s public.poll_subscriptions;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_info:=public._mail_notification_source_info_prototype(q);
   IF before_info IS NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
   SELECT * INTO f FROM public.friendships WHERE id=(before_info->>'friendship_id')::uuid;
   SELECT * INTO s FROM public.poll_subscriptions WHERE id=(before_info->>'subscription_id')::uuid;
   SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(ARRAY[q.created_by,(before_info->>'owner_id')::uuid,(before_info->>'recipient_id')::uuid,
     public._poll_registered_uid(before_info->>'email'),f.requester_id,f.addressee_id,s.owner_id,s.registered_user_id,s.subscriber_user_id]) AS roots(id) WHERE id IS NOT NULL;
   PERFORM 1 FROM auth.users WHERE id=ANY(ids) ORDER BY id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.profiles WHERE id=ANY(ids) ORDER BY id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.user_flags WHERE user_id=ANY(ids) ORDER BY user_id FOR SHARE NOWAIT;
   SELECT array_agg(DISTINCT mail ORDER BY mail) INTO mails FROM unnest(ARRAY[public._norm_email(q.to_email),public._norm_email(before_info->>'email'),public._norm_email(s.subscriber_email)]) AS roots(mail) WHERE mail IS NOT NULL;
   FOREACH mailbox IN ARRAY coalesce(mails,'{}'::text[]) LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||mailbox,351)) THEN RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03'; END IF;
   END LOOP;
   PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=ANY(mails) ORDER BY email FOR SHARE NOWAIT;
   IF f.id IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329)) THEN RAISE EXCEPTION 'friend pair busy' USING ERRCODE='55P03'; END IF;
   IF s.id IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(s.owner_id::text||':email:'||public._norm_email(s.subscriber_email),333)) THEN RAISE EXCEPTION 'subscriber pair busy' USING ERRCODE='55P03'; END IF;
   PERFORM 1 FROM public.games WHERE id=(before_info->>'game_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.question_bases WHERE id=(before_info->>'base_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.control_runtime_sessions WHERE id=(before_info->>'session_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.poll_subscriptions WHERE id=s.id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.friendships WHERE id=f.id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.poll_tasks WHERE id=q.notification_poll_task_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.base_share_tasks WHERE id=q.notification_base_task_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.control_device_shares WHERE id=q.notification_device_share_id FOR SHARE NOWAIT;
   after_info:=public._mail_notification_source_info_prototype(q);
   IF before_info IS DISTINCT FROM after_info THEN RAISE EXCEPTION 'source parents changed' USING ERRCODE='55P03'; END IF;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mail_queue_notification_source_bind_prototype()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb; allocation public.mail_notification_allocations_prototype; source_id uuid;
BEGIN
 IF NEW.cooldown_action_key !~ '^(friend|poll|base|device):' THEN
  IF NEW.created_by IS NOT NULL OR NEW.notification_source_kind IS NOT NULL OR NEW.notification_source_token IS NOT NULL OR NEW.notification_allocation_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.created_by IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.created_by)
  OR NEW.notification_source_token IS NULL OR NOT public._mail_notification_action_matches_prototype(NEW.notification_source_kind,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 NEW.notification_friendship_id:=NULL;NEW.notification_subscription_id:=NULL;NEW.notification_poll_task_id:=NULL;NEW.notification_base_task_id:=NULL;NEW.notification_device_share_id:=NULL;
 CASE NEW.notification_source_kind
  WHEN 'friend' THEN SELECT id INTO NEW.notification_friendship_id FROM public.friendships WHERE token=NEW.notification_source_token;
  WHEN 'subscription' THEN SELECT id INTO NEW.notification_subscription_id FROM public.poll_subscriptions WHERE token=NEW.notification_source_token;
  WHEN 'poll' THEN SELECT id INTO NEW.notification_poll_task_id FROM public.poll_tasks WHERE token=NEW.notification_source_token;
  WHEN 'base' THEN SELECT id INTO NEW.notification_base_task_id FROM public.base_share_tasks WHERE token=NEW.notification_source_token;
  WHEN 'device' THEN SELECT id INTO NEW.notification_device_share_id FROM public.control_device_shares WHERE token=NEW.notification_source_token;
 END CASE;
 info:=public._mail_notification_source_info_prototype(NEW);
 IF info IS NULL OR (info->>'owner_id')::uuid IS DISTINCT FROM NEW.created_by OR info->>'email' IS DISTINCT FROM public._norm_email(NEW.to_email) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
 PERFORM public._mail_notification_source_lock_prototype(NEW);
 -- Existing cooldown/event writers can start from a child. Never wait on them
 -- while holding identity/source roots; release this subtransaction and retry.
 PERFORM 1 FROM public.mail_cooldowns WHERE action_key='baseline:recipient'
  AND target_key='pair:'||NEW.created_by::text||':'||md5(lower(trim(NEW.to_email))) FOR UPDATE NOWAIT;
 IF NEW.cooldown_action_key='poll:share' THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-mail-budget:'||NEW.created_by||':'||public._norm_email(NEW.to_email),342)) THEN
   RAISE EXCEPTION 'poll mail budget busy' USING ERRCODE='55P03';
  END IF;
  PERFORM 1 FROM public.poll_mail_budget_events WHERE owner_id=NEW.created_by
   AND recipient_key=md5(public._norm_email(NEW.to_email)) FOR UPDATE NOWAIT;
 END IF;
 info:=public._mail_notification_source_info_prototype(NEW);
 NEW.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(NEW.to_email));
 IF NEW.notification_source_kind='device' AND (NEW.meta#>>'{notification_reference,device_type}' IS DISTINCT FROM info#>>'{snapshot,device_type}'
  OR NEW.meta#>>'{notification_reference,game_id}' IS DISTINCT FROM info#>>'{snapshot,game_id}') THEN RAISE EXCEPTION 'invalid_notification_reference'; END IF;
 IF NOT public._mail_notification_source_live_prototype(NEW) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 SELECT * INTO allocation FROM public.mail_notification_allocations_prototype a
  WHERE a.owner_id=NEW.created_by AND a.to_email=public._norm_email(NEW.to_email)
   AND a.source_kind=NEW.notification_source_kind AND a.source_token=NEW.notification_source_token
   AND a.friendship_id IS NOT DISTINCT FROM NEW.notification_friendship_id
   AND a.subscription_id IS NOT DISTINCT FROM NEW.notification_subscription_id
   AND a.poll_task_id IS NOT DISTINCT FROM NEW.notification_poll_task_id
   AND a.base_task_id IS NOT DISTINCT FROM NEW.notification_base_task_id
   AND a.device_share_id IS NOT DISTINCT FROM NEW.notification_device_share_id
   AND a.snapshot=NEW.notification_snapshot AND a.consumed_at IS NULL AND a.revoked_at IS NULL AND a.enqueue_before>clock_timestamp()
  ORDER BY a.created_at DESC,a.id LIMIT 1 FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_notification_attempt'; END IF;
 UPDATE public.mail_notification_allocations_prototype SET consumed_at=clock_timestamp(),consumed_queue_id=NEW.id WHERE id=allocation.id;
 NEW.notification_allocation_id:=allocation.id;
 RETURN NEW;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_source_lock_prototype(public.mail_queue),public.mail_queue_notification_source_bind_prototype() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_mail_queue_002_notification_source_bind_prototype BEFORE INSERT ON public.mail_queue
 FOR EACH ROW EXECUTE FUNCTION public.mail_queue_notification_source_bind_prototype();
