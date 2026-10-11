-- E19 §5 pkt 3: token zaproszenia wskazuje jeden wpis i jeden adres.
-- Zamkniętego tokenu nie można wykorzystać do utworzenia nowej subskrypcji.
BEGIN;
CREATE OR REPLACE FUNCTION public.poll_sub_accept_email(p_token uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e text := public._norm_email(p_email);
  s public.poll_subscriptions%rowtype;
BEGIN
  IF e IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','missing_email');
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token');
  END IF;
  IF s.subscriber_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','registered_invite_requires_login');
  END IF;
  IF s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL OR s.status NOT IN ('pending','active') THEN
    RETURN jsonb_build_object('ok',false,'error','already_closed');
  END IF;
  -- Match the address also on idempotent acceptance of an active invitation.
  IF public._norm_email(s.subscriber_email) IS DISTINCT FROM e THEN
    RETURN jsonb_build_object('ok',false,'error','email_mismatch');
  END IF;
  IF s.status='active' THEN
    RETURN jsonb_build_object('ok',true,'kind','sub','action','accept','note','already_active');
  END IF;
  UPDATE public.poll_subscriptions SET status='active',
    accepted_at=coalesce(accepted_at,now()), opened_at=coalesce(opened_at,now())
    WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'kind','sub','action','accept');
END;
$$;

CREATE OR REPLACE FUNCTION public.poll_go_subscribe_email(p_token uuid, p_email text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((public.poll_sub_accept_email(p_token,p_email)->>'ok')::boolean,false);
$$;
COMMIT;
