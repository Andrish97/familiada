-- LOCAL DRAFT. Claim is a filter; delivery locks and checks all current parents.
CREATE OR REPLACE FUNCTION public._mail_notification_queue_live_prototype(q public.mail_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF q.cooldown_action_key ~ '^(friend|poll|base|device):' THEN
  RETURN public._mail_notification_source_live_prototype(q) AND EXISTS(
   SELECT 1 FROM public.mail_notification_allocations_prototype a WHERE a.id=q.notification_allocation_id
    AND a.consumed_queue_id=q.id AND a.consumed_at IS NOT NULL AND a.revoked_at IS NULL
    AND a.owner_id=q.created_by AND a.to_email=public._norm_email(q.to_email)
    AND a.source_kind=q.notification_source_kind AND a.source_token=q.notification_source_token
    AND a.snapshot=q.notification_snapshot
    AND a.friendship_id IS NOT DISTINCT FROM q.notification_friendship_id
    AND a.subscription_id IS NOT DISTINCT FROM q.notification_subscription_id
    AND a.poll_task_id IS NOT DISTINCT FROM q.notification_poll_task_id
    AND a.base_task_id IS NOT DISTINCT FROM q.notification_base_task_id
    AND a.device_share_id IS NOT DISTINCT FROM q.notification_device_share_id);
 END IF;
 IF q.created_by IS NOT NULL OR q.notification_source_kind IS NOT NULL OR q.notification_allocation_id IS NOT NULL THEN RETURN false; END IF;
 IF q.cooldown_action_key='mail:center_verify' THEN
  RETURN public._mail_center_verification_live_prototype(q.mail_center_link_id_prototype,q.to_email);
 END IF;
 IF q.contact_source_expected_prototype OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id_prototype IS NOT NULL THEN
  RETURN public._mail_contact_source_live_prototype(q.contact_message_id_prototype,q.to_email,q.cooldown_action_key);
 END IF;
 RETURN public._contact_mail_enabled(q.to_email);
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_queue_live_prototype(public.mail_queue) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mail_queue_delivery_context_prototype(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; initial public.mail_queue; link public.mail_center_links_prototype;
 root_id uuid; issued jsonb; current_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT * INTO initial FROM public.mail_queue WHERE id=p_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF initial.notification_source_kind IS NOT NULL THEN
    IF public._mail_notification_source_info_prototype(initial) IS NULL THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
    END IF;
    PERFORM public._mail_notification_source_lock_prototype(initial);
   END IF;
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
   PERFORM 1 FROM public.mail_notification_allocations_prototype WHERE id=initial.notification_allocation_id FOR SHARE NOWAIT;
   SELECT * INTO q FROM public.mail_queue WHERE id=p_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF public._mail_notification_fields_prototype(to_jsonb(q),ARRAY['notification_source_kind','notification_source_token','notification_friendship_id','notification_subscription_id','notification_poll_task_id','notification_base_task_id','notification_device_share_id','notification_snapshot','notification_allocation_id','created_by'])
     IS DISTINCT FROM public._mail_notification_fields_prototype(to_jsonb(initial),ARRAY['notification_source_kind','notification_source_token','notification_friendship_id','notification_subscription_id','notification_poll_task_id','notification_base_task_id','notification_device_share_id','notification_snapshot','notification_allocation_id','created_by'])
    OR public._norm_email(q.to_email) IS DISTINCT FROM public._norm_email(initial.to_email)
    OR q.cooldown_action_key IS DISTINCT FROM initial.cooldown_action_key
    OR q.mail_center_link_id_prototype IS DISTINCT FROM initial.mail_center_link_id_prototype
    OR q.contact_message_id_prototype IS DISTINCT FROM initial.contact_message_id_prototype
    OR q.contact_source_expected_prototype IS DISTINCT FROM initial.contact_source_expected_prototype THEN
     RAISE EXCEPTION 'delivery source changed' USING ERRCODE='55P03';
   END IF;
   IF q.status<>'sending' THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_not_claimed'); END IF;
   IF q.cooldown_action_key ~ '^(friend|poll|base|device):' AND NOT public._mail_notification_queue_live_prototype(q) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
   END IF;
   IF q.cooldown_action_key='mail:center_verify' THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_center_verification_live_prototype(q.mail_center_link_id_prototype,q.to_email) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_verification_closed');
    END IF;
    -- Global mail-off is intentionally bypassed only for this private proof.
    RETURN jsonb_build_object('ok',true,'allowed',true,'verification',true,'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
   END IF;
   IF q.contact_source_expected_prototype OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id_prototype IS NOT NULL THEN
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
  WHEN raise_exception THEN
   IF SQLERRM<>'invalid_notification_source' THEN RAISE; END IF;
   RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mail_queue_delivery_context_prototype(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_queue_delivery_context_prototype(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.mail_queue_pick(p_limit integer)
RETURNS SETOF public.mail_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE q.status='pending' AND q.not_before<=now()
   AND public._mail_notification_queue_live_prototype(q)
  ORDER BY q.created_at,q.id LIMIT greatest(1,least(coalesce(p_limit,25),200)) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='sending',attempts=q.attempts+1,picked_at=now(),last_attempt_at=now()
 FROM candidates c WHERE q.id=c.id RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.mail_queue_pick_selected(p_ids uuid[],p_limit integer DEFAULT 25)
RETURNS SETOF public.mail_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE q.id=ANY(p_ids) AND q.status='pending' AND q.not_before<=now()
   AND public._mail_notification_queue_live_prototype(q)
  ORDER BY array_position(p_ids,q.id),q.created_at LIMIT greatest(1,least(coalesce(p_limit,25),200)) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='sending',attempts=q.attempts+1,picked_at=now(),last_attempt_at=now()
 FROM candidates c WHERE q.id=c.id RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.mail_queue_requeue(p_ids uuid[] DEFAULT NULL,p_only_failed boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE affected integer;
BEGIN
 -- Active sending leases are never reset by a bulk retry. Retain future delay.
 WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE (p_ids IS NULL OR q.id=ANY(p_ids))
   AND (q.status='failed' OR (NOT p_only_failed AND q.status='pending'))
   AND public._mail_notification_queue_live_prototype(q) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='pending',not_before=greatest(q.not_before,now()),picked_at=NULL,last_error=NULL,provider_used=NULL
 FROM candidates c WHERE q.id=c.id;
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;
