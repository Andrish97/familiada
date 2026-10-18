-- E14 follow-up: email-origin rows stay email-origin after their address has
-- been bound to a regular account. Return has_account for old links instead
-- of the removed direct-user invitation response.
BEGIN;

CREATE OR REPLACE FUNCTION public.poll_sub_accept_email(p_token uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  e text:=public._norm_email(p_email);
  s public.poll_subscriptions%rowtype;
  deadline timestamptz;
BEGIN
  IF e IS NULL THEN RETURN jsonb_build_object('ok',false,'error','missing_email'); END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
  IF FOUND THEN
    PERFORM public._poll_identity_email_refs(
      ARRAY[s.subscriber_email],ARRAY[s.owner_id,s.registered_user_id,auth.uid()]);
    PERFORM public._subscriber_pair_lock(s.owner_id,s.subscriber_email);
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
  IF s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL
     OR s.status NOT IN ('pending','active') THEN
    RETURN jsonb_build_object('ok',false,'error','already_closed');
  END IF;
  IF public._norm_email(s.subscriber_email) IS DISTINCT FROM e THEN
    RETURN jsonb_build_object('ok',false,'error','email_mismatch');
  END IF;
  IF s.registered_user_id IS NOT NULL OR public._poll_registered_uid(e) IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','has_account');
  END IF;
  deadline:=public._subscriber_refusal_until(s.owner_id,e);
  IF deadline IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_until',deadline);
  END IF;
  IF s.status='active' THEN
    RETURN jsonb_build_object('ok',true,'kind','sub','action','accept','note','already_active');
  END IF;
  UPDATE public.poll_subscriptions SET status='active',
    accepted_at=coalesce(accepted_at,now()),opened_at=coalesce(opened_at,now())
   WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'kind','sub','action','accept');
END;
$$;

COMMIT;
