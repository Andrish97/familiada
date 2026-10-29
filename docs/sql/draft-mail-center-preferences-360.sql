-- LOCAL DRAFT: one effective flag, canonical Auth address, explicit restoration.
-- Registered access cancellation is deliberately unchanged pending scope decision.
CREATE OR REPLACE FUNCTION public.get_my_email_notifications_prototype(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT public._norm_email(u.email) INTO mailbox FROM auth.users u
  WHERE u.id=p_user_id AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR SHARE;
 IF NOT FOUND OR mailbox IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM public._mail_center_identity_lock_prototype(mailbox);
 RETURN public._contact_mail_enabled(mailbox);
END $$;
CREATE OR REPLACE FUNCTION public.set_my_email_notifications_prototype(p_user_id uuid,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; confirmed timestamptz; root uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id OR p_enabled IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT public._norm_email(u.email),u.email_confirmed_at INTO mailbox,confirmed FROM auth.users u
    WHERE u.id=p_user_id AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR SHARE NOWAIT;
   IF NOT FOUND OR mailbox IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF p_enabled AND confirmed IS NULL THEN RAISE EXCEPTION 'email_not_confirmed'; END IF;
   PERFORM public._mail_center_identity_lock_prototype(mailbox);
   SELECT token INTO root FROM public.email_unsub_tokens WHERE email=mailbox FOR UPDATE NOWAIT;
   IF NOT FOUND THEN root:=public._ensure_unsub_token(mailbox); END IF;
   PERFORM 1 FROM public.user_flags WHERE user_id=p_user_id FOR UPDATE NOWAIT;
   INSERT INTO public.user_flags(user_id,email_notifications) VALUES(p_user_id,p_enabled)
    ON CONFLICT(user_id) DO UPDATE SET email_notifications=excluded.email_notifications;
   UPDATE public.email_unsub_tokens SET suppressed_at=CASE WHEN p_enabled THEN NULL ELSE coalesce(suppressed_at,clock_timestamp()) END WHERE token=root;
   RETURN public._contact_mail_enabled(mailbox);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_my_email_notifications_prototype(uuid),public.set_my_email_notifications_prototype(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_email_notifications_prototype(uuid),public.set_my_email_notifications_prototype(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_profile_created_check_suppression()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text;
BEGIN
 SELECT public._norm_email(u.email) INTO mailbox FROM auth.users u
  WHERE u.id=NEW.id AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF mailbox IS NOT NULL AND EXISTS(SELECT 1 FROM public.email_unsub_tokens WHERE email=mailbox AND suppressed_at IS NOT NULL) THEN
  INSERT INTO public.user_flags(user_id,email_notifications) VALUES(NEW.id,false)
   ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 END IF;
 -- Root stays: account creation is not an instruction to enable notifications.
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.poll_go_global_unsubscribe(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; result jsonb;
BEGIN
 SELECT email INTO mailbox FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_anon_source_locks_prototype(mailbox);
 IF public._poll_registered_uid(mailbox) IS NULL THEN
  result:=public.mail_anon_resign_prototype(p_token);
  -- Preserve old unsubscribe authority without exposing private lists/counts.
  RETURN jsonb_build_object('ok',result->>'ok'='true');
 END IF;
 PERFORM 1 FROM public.email_unsub_tokens WHERE token=p_token AND email=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,clock_timestamp()) WHERE token=p_token;
 -- Account mail-off affects mail only; accesses retain their own decisions.
 RETURN jsonb_build_object('ok',true);
END $$;
