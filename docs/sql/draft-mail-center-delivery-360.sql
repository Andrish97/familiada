-- LOCAL DRAFT: actual delivery reads the current row, preference and proof.
-- Ordinary invitation source bindings are the next graph layer, not covered here.
ALTER TABLE public.mail_queue ADD COLUMN contact_message_id_prototype uuid
 REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public._mail_contact_source_live_prototype(p_message uuid,p_email text,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.messages m JOIN public.reports r ON r.id=m.report_id
  WHERE m.id=p_message AND m.direction='inbound' AND m.deleted_at IS NULL
    AND public._norm_email(m.from_email)=public._norm_email(p_email)
    AND ((p_action='contact:confirmation' AND m.source='form' AND m.created_at>clock_timestamp()-interval '24 hours')
      OR (p_action='admin:compose' AND m.source IN('form','email'))));
$$;
REVOKE ALL ON FUNCTION public._mail_contact_source_live_prototype(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mail_contact_reply_source_prototype(p_report uuid,p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT m.id FROM public.messages m WHERE m.report_id=p_report
  AND public._mail_contact_source_live_prototype(m.id,p_email,'admin:compose')
  ORDER BY m.created_at DESC,m.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.mail_contact_reply_source_prototype(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_contact_reply_source_prototype(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_queue_delivery_context_prototype(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; initial public.mail_queue; link public.mail_center_links_prototype;
 root_id uuid; issued jsonb; current_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT * INTO initial FROM public.mail_queue WHERE id=p_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   PERFORM public._mail_center_identity_lock_prototype(public._norm_email(initial.to_email));
   current_uid:=public._poll_registered_uid(initial.to_email);
   PERFORM 1 FROM public.user_flags WHERE user_id=current_uid FOR SHARE NOWAIT;
   IF initial.cooldown_action_key='mail:center_verify' THEN
    SELECT * INTO link FROM public.mail_center_links_prototype WHERE id=initial.mail_center_link_id_prototype FOR SHARE NOWAIT;
   ELSE
    IF initial.contact_message_id_prototype IS NOT NULL THEN
     PERFORM 1 FROM public.reports WHERE id=(SELECT report_id FROM public.messages WHERE id=initial.contact_message_id_prototype) FOR SHARE NOWAIT;
     PERFORM 1 FROM public.messages WHERE id=initial.contact_message_id_prototype FOR SHARE NOWAIT;
    END IF;
    root_id:=public._ensure_unsub_token(initial.to_email);
    PERFORM 1 FROM public.email_unsub_tokens WHERE token=root_id FOR SHARE NOWAIT;
   END IF;
   SELECT * INTO q FROM public.mail_queue WHERE id=p_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF public._norm_email(q.to_email) IS DISTINCT FROM public._norm_email(initial.to_email)
    OR q.cooldown_action_key IS DISTINCT FROM initial.cooldown_action_key
    OR q.mail_center_link_id_prototype IS DISTINCT FROM initial.mail_center_link_id_prototype
    OR q.contact_message_id_prototype IS DISTINCT FROM initial.contact_message_id_prototype THEN
     RAISE EXCEPTION 'delivery source changed' USING ERRCODE='55P03';
   END IF;
   IF q.status<>'sending' THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_not_claimed'); END IF;
   IF q.cooldown_action_key='mail:center_verify' THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_center_verification_live_prototype(q.mail_center_link_id_prototype,q.to_email) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_verification_closed');
    END IF;
    -- Global mail-off is intentionally bypassed only for this private proof.
    RETURN jsonb_build_object('ok',true,'allowed',true,'verification',true,'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
   END IF;
   IF q.cooldown_action_key='contact:confirmation' OR q.contact_message_id_prototype IS NOT NULL THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_contact_source_live_prototype(q.contact_message_id_prototype,q.to_email,q.cooldown_action_key) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_contact_closed');
    END IF;
   ELSIF NOT public._contact_mail_enabled(q.to_email) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_preference');
   END IF;
   issued:=public.mail_center_issue_link_prototype(q.to_email,'footer');
   IF issued->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'delivery footer unavailable'; END IF;
   -- The full capability is returned only to delivery; never write it to q.html.
   RETURN jsonb_build_object('ok',true,'allowed',true,'verification',false,'footer_token',issued->>'token',
     'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mail_queue_delivery_context_prototype(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_queue_delivery_context_prototype(uuid) TO service_role;

-- Keep the same final preference guard, with two private requested exceptions.
CREATE OR REPLACE FUNCTION public.mail_queue_notification_preference_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF NEW.cooldown_action_key='mail:center_verify' THEN
  IF NEW.created_by IS NOT NULL OR NEW.mail_center_link_id_prototype IS NULL
    OR NOT public._mail_center_verification_live_prototype(NEW.mail_center_link_id_prototype,NEW.to_email) THEN RAISE EXCEPTION 'invalid_verification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.cooldown_action_key='contact:confirmation' OR NEW.contact_message_id_prototype IS NOT NULL THEN
  IF NEW.created_by IS NOT NULL OR NOT public._mail_contact_source_live_prototype(NEW.contact_message_id_prototype,NEW.to_email,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_contact_source'; END IF;
  RETURN NEW;
 END IF;
 IF NOT public._contact_mail_enabled(NEW.to_email) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
