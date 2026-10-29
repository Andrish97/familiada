\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3340-0000-0000-000000000001','test7@familiada.online'),
 ('bbbbbbbb-3340-0000-0000-000000000002','real334@example.net');
INSERT INTO public.email_unsub_tokens(email,suppressed_at) VALUES
 ('test14@familiada.online',now()),('real334@example.net',now())
ON CONFLICT(email) DO UPDATE SET suppressed_at=excluded.suppressed_at;
DO $$ DECLARE r jsonb; stamp timestamptz; BEGIN
 IF has_function_privilege('anon','public.e2e_subscriber_mail_flag(boolean)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.e2e_subscriber_mail_flag(boolean)','EXECUTE') THEN RAISE EXCEPTION 'ACL'; END IF;
 r:=public.e2e_subscriber_mail_flag(true);
 IF r->>'ok'<>'false' THEN RAISE EXCEPTION 'anonymous caller'; END IF;
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3340-0000-0000-000000000002',true);
 IF public.e2e_subscriber_mail_flag(true)->>'ok'<>'false' THEN RAISE EXCEPTION 'non-test caller'; END IF;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3340-0000-0000-000000000001',true);
 SELECT suppressed_at INTO stamp FROM public.email_unsub_tokens WHERE email='test14@familiada.online';
 r:=public.e2e_subscriber_mail_flag(false);
 IF (r->>'suppressed_at')::timestamptz IS DISTINCT FROM stamp
 OR (SELECT suppressed_at FROM public.email_unsub_tokens WHERE email='test14@familiada.online') IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'read mutates flag'; END IF;
 r:=public.e2e_subscriber_mail_flag(NULL);
 IF (r->>'suppressed_at')::timestamptz IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'null resets flag'; END IF;
 r:=public.e2e_subscriber_mail_flag(true);
 IF (r->>'previous_suppressed_at')::timestamptz IS DISTINCT FROM stamp
 OR (SELECT suppressed_at FROM public.email_unsub_tokens WHERE email='test14@familiada.online') IS NOT NULL
 OR (SELECT suppressed_at FROM public.email_unsub_tokens WHERE email='real334@example.net') IS NULL THEN RAISE EXCEPTION 'reset scope'; END IF;
 IF public.e2e_subscriber_mail_flag(true)->>'suppressed_at' IS NOT NULL THEN RAISE EXCEPTION 'idempotence'; END IF;
END $$;
ROLLBACK;
