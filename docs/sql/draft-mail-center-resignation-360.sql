-- LOCAL ONLY. Latest decision: mail-only global resignation closes all owned sources.
-- Registered-account access cancellation awaits explicit scope clarification.
CREATE OR REPLACE FUNCTION public._mail_anon_source_owners_prototype(p_email text)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) FROM (
  SELECT owner_id AS id FROM public.poll_subscriptions WHERE public._norm_email(subscriber_email)=p_email
    AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND status IN('pending','active')
  UNION SELECT owner_id FROM public.poll_tasks WHERE public._norm_email(recipient_email)=p_email
    AND recipient_user_id IS NULL AND status IN('pending','opened')
  UNION SELECT owner_id FROM public.control_device_shares WHERE public._norm_email(recipient_email)=p_email
    AND recipient_id IS NULL AND revoked_at IS NULL
  UNION SELECT public._poll_registered_uid(p_email)
  UNION SELECT auth.uid()
 ) roots WHERE id IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public._mail_anon_source_locks_prototype(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE before_ids uuid[]; after_ids uuid[]; owner_id uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_ids:=public._mail_anon_source_owners_prototype(p_email);
   PERFORM 1 FROM auth.users WHERE id=ANY(before_ids) ORDER BY id FOR SHARE NOWAIT;
   IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||p_email,351)) THEN
    RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03';
   END IF;
   after_ids:=public._mail_anon_source_owners_prototype(p_email);
   IF after_ids IS DISTINCT FROM before_ids THEN RAISE EXCEPTION 'mail parents changed' USING ERRCODE='55P03'; END IF;
   FOR owner_id IN SELECT s.owner_id FROM public.poll_subscriptions s WHERE public._norm_email(s.subscriber_email)=p_email
     AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND s.status IN('pending','active') ORDER BY s.owner_id,s.id LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended(owner_id::text||':email:'||p_email,333)) THEN
     RAISE EXCEPTION 'contact pair busy' USING ERRCODE='55P03';
    END IF;
   END LOOP;
   PERFORM 1 FROM public.games WHERE id IN(
    SELECT game_id FROM public.poll_tasks WHERE recipient_user_id IS NULL AND public._norm_email(recipient_email)=p_email AND status IN('pending','opened')
    UNION SELECT game_id FROM public.control_device_shares WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=p_email AND revoked_at IS NULL
   ) ORDER BY id FOR UPDATE NOWAIT;
   PERFORM 1 FROM public.control_runtime_sessions WHERE id IN(
    SELECT session_id FROM public.control_device_shares WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=p_email AND revoked_at IS NULL
   ) ORDER BY id FOR UPDATE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.mail_anon_resign_prototype(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; root_token uuid; item record; closed integer:=0; tasks integer; devices integer;
BEGIN
 SELECT public._norm_email(email) INTO mailbox FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_anon_source_locks_prototype(mailbox);
 IF public._poll_registered_uid(mailbox) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 SELECT token INTO root_token FROM public.email_unsub_tokens WHERE token=p_token AND public._norm_email(email)=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,now()) WHERE token=root_token;
 FOR item IN SELECT token FROM public.poll_subscriptions WHERE public._norm_email(subscriber_email)=mailbox
   AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND status IN('pending','active') ORDER BY owner_id,id LOOP
  IF public._subscriber_close(item.token,true) THEN closed:=closed+1; END IF;
 END LOOP;
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=coalesce(cancelled_at,now())
  WHERE recipient_user_id IS NULL AND public._norm_email(recipient_email)=mailbox AND status IN('pending','opened');
 GET DIAGNOSTICS tasks=ROW_COUNT;
 UPDATE public.control_device_shares SET revoked_at=coalesce(revoked_at,now())
  WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=mailbox AND revoked_at IS NULL;
 GET DIAGNOSTICS devices=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'subscriptions_closed',closed,'tasks_closed',tasks,'devices_revoked',devices);
END $$;
REVOKE ALL ON FUNCTION public._mail_anon_source_owners_prototype(text),public._mail_anon_source_locks_prototype(text),public.mail_anon_resign_prototype(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mail_center_set_notifications_prototype(p_secret text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; scope jsonb; result jsonb; root uuid;
BEGIN
 IF p_enabled IS NULL OR p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 -- Resolve parents without row locks, acquire source roots before link/session locks.
 SELECT l.email INTO mailbox FROM public.mail_center_sessions_prototype s
 JOIN public.mail_center_links_prototype l ON l.id=s.link_id
 WHERE s.secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
   AND s.revoked_at IS NULL AND l.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 PERFORM public._mail_anon_source_locks_prototype(mailbox);
 scope:=public._mail_center_scope_prototype(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 IF scope->>'email' IS DISTINCT FROM mailbox THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 SELECT token INTO root FROM public.email_unsub_tokens WHERE email=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF p_enabled THEN
  UPDATE public.email_unsub_tokens SET suppressed_at=NULL WHERE token=root;
  RETURN jsonb_build_object('ok',true,'notifications_enabled',true);
 END IF;
 result:=public.mail_anon_resign_prototype(root);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RETURN result; END IF;
 RETURN result||jsonb_build_object('notifications_enabled',false);
END $$;
REVOKE ALL ON FUNCTION public.mail_center_set_notifications_prototype(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_set_notifications_prototype(text,boolean) TO service_role;
