-- E14 follow-up: an email-origin subscription remains visible to its owner
-- after it becomes bound to the original account. The retired
-- subscriber_user_id column used to mark email-origin rows; after its removal
-- subscriber_email is the source marker, while registered_user_id identifies
-- the account currently bound to that address.
BEGIN;

CREATE OR REPLACE FUNCTION public.subscribers_list()
RETURNS TABLE(
  id uuid,
  email text,
  status text,
  created_at timestamptz,
  token uuid,
  email_sent_at timestamptz,
  email_send_count integer,
  friend_user_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb;
BEGIN
  SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
  IF NOT public._account_is_registered(uid,identity) THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id,
         coalesce((SELECT u.email FROM auth.users u WHERE u.id=s.registered_user_id),s.subscriber_email)::text,
         s.status,s.created_at,s.token,s.email_sent_at,s.email_send_count,
         coalesce(s.registered_user_id,public._poll_registered_uid(s.subscriber_email))
  FROM public.poll_subscriptions s
  WHERE s.owner_id=uid AND s.subscriber_email IS NOT NULL
    AND (s.status IN('pending','active') OR (s.status='declined' AND s.declined_at>now()-interval '5 days'))
  ORDER BY s.created_at DESC;
END $$;

-- Every remaining subscription originated from an email address. A bound
-- registered_user_id means that the address now belongs to an account; it
-- must produce the account-required result below, not the retired direct-UID
-- invitation result that subscriber_user_id used to signal.
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
