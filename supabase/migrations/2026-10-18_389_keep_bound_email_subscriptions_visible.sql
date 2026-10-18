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

COMMIT;
