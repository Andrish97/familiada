-- Izolowany Postgres: tokeny anonimowych subskrypcji, bez kolejki/maili.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3310-0000-0000-000000000001','owner331@example.net'),
 ('bbbbbbbb-3310-0000-0000-000000000002','account331@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3310-0000-0000-000000000001','owner331@example.net','fixtureowner331'),
 ('bbbbbbbb-3310-0000-0000-000000000002','account331@example.net','fixtureaccount331')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
DO $$
DECLARE owner_id uuid:='aaaaaaaa-3310-0000-0000-000000000001';
 account_id uuid:='bbbbbbbb-3310-0000-0000-000000000002';
 sid uuid; tok uuid; r jsonb; stamp timestamptz; n integer; state text;
BEGIN
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status)
 VALUES(owner_id,'recipient331@example.net','pending') RETURNING id,token INTO sid,tok;
 SELECT count(*) INTO n FROM public.poll_subscriptions;
 IF public.poll_sub_accept_email(gen_random_uuid(),'recipient331@example.net')->>'error' IS DISTINCT FROM 'invalid_token'
 OR public.poll_go_subscribe_email(gen_random_uuid(),'recipient331@example.net') THEN RAISE EXCEPTION 'unknown token'; END IF;
 IF public.poll_sub_accept_email(tok,' ')->>'error' IS DISTINCT FROM 'missing_email'
 OR public.poll_go_subscribe_email(tok,' ') THEN RAISE EXCEPTION 'empty email'; END IF;
 IF public.poll_sub_accept_email(tok,'other331@example.net')->>'error' IS DISTINCT FROM 'email_mismatch'
 OR public.poll_go_subscribe_email(tok,'other331@example.net') THEN RAISE EXCEPTION 'pending email mismatch'; END IF;
 IF (SELECT status FROM public.poll_subscriptions WHERE id=sid)<>'pending' THEN RAISE EXCEPTION 'invalid attempt mutated invite'; END IF;
 r:=public.poll_sub_accept_email(tok,' RECIPIENT331@EXAMPLE.NET ');
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'normalized anonymous acceptance %',r; END IF;
 SELECT accepted_at INTO stamp FROM public.poll_subscriptions WHERE id=sid;
 IF stamp IS NULL OR (SELECT opened_at FROM public.poll_subscriptions WHERE id=sid) IS NULL THEN RAISE EXCEPTION 'accept timestamps'; END IF;
 IF NOT public.poll_go_subscribe_email(tok,'recipient331@example.net')
 OR public.poll_sub_accept_email(tok,'recipient331@example.net')->>'note' IS DISTINCT FROM 'already_active'
 OR (SELECT accepted_at FROM public.poll_subscriptions WHERE id=sid) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'active idempotence'; END IF;
 IF public.poll_go_subscribe_email(tok,'other331@example.net')
 OR public.poll_sub_accept_email(tok,'other331@example.net')->>'error' IS DISTINCT FROM 'email_mismatch' THEN RAISE EXCEPTION 'active email mismatch'; END IF;
 IF (SELECT count(*) FROM public.poll_subscriptions)<>n THEN RAISE EXCEPTION 'accept created extra record'; END IF;
 FOREACH state IN ARRAY ARRAY['declined','cancelled'] LOOP
   UPDATE public.poll_subscriptions SET status=state,declined_at=NULL,cancelled_at=NULL WHERE id=sid;
   IF public.poll_go_subscribe_email(tok,'recipient331@example.net')
   OR public.poll_go_subscribe_email(tok,'other331@example.net')
   OR public.poll_sub_accept_email(tok,'recipient331@example.net')->>'error' IS DISTINCT FROM 'already_closed' THEN
     RAISE EXCEPTION 'closed status revived %',state;
   END IF;
 END LOOP;
 UPDATE public.poll_subscriptions SET status='pending',declined_at=now() WHERE id=sid;
 IF public.poll_go_subscribe_email(tok,'recipient331@example.net') THEN RAISE EXCEPTION 'decline timestamp bypass'; END IF;
 UPDATE public.poll_subscriptions SET declined_at=NULL,cancelled_at=now() WHERE id=sid;
 IF public.poll_go_subscribe_email(tok,'recipient331@example.net') THEN RAISE EXCEPTION 'cancel timestamp bypass'; END IF;
 UPDATE public.poll_subscriptions SET subscriber_email=NULL,subscriber_user_id=account_id,cancelled_at=NULL WHERE id=sid;
 IF public.poll_go_subscribe_email(tok,'account331@example.net')
 OR public.poll_sub_accept_email(tok,'account331@example.net')->>'error' IS DISTINCT FROM 'registered_invite_requires_login' THEN
   RAISE EXCEPTION 'registered invite accepted anonymously';
 END IF;
 IF (SELECT count(*) FROM public.poll_subscriptions)<>n THEN RAISE EXCEPTION 'closed token created extra record'; END IF;
 DELETE FROM public.poll_subscriptions WHERE id=sid;
 IF public.poll_go_subscribe_email(tok,'recipient331@example.net') THEN RAISE EXCEPTION 'deleted token'; END IF;
END;
$$;
-- Execute as anon through the actual grants/RLS, not just as the DB owner.
INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,token) VALUES
 ('aaaaaaaa-3310-0000-0000-000000000001','anon331@example.net','pending','cccccccc-3310-0000-0000-000000000003');
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF NOT public.poll_go_subscribe_email('cccccccc-3310-0000-0000-000000000003','anon331@example.net') THEN RAISE EXCEPTION 'anonymous RPC ACL'; END IF;
END; $$;
RESET ROLE;
ROLLBACK;
