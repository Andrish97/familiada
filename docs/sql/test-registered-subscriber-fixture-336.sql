\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3360-0000-0000-000000000001','test7@familiada.online'),
 ('bbbbbbbb-3360-0000-0000-000000000002','test8@familiada.online'),
 ('cccccccc-3360-0000-0000-000000000003','real336@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3360-0000-0000-000000000001','test7@familiada.online','testfixture336'),
 ('bbbbbbbb-3360-0000-0000-000000000002','test8@familiada.online','recipientfixture336'),
 ('cccccccc-3360-0000-0000-000000000003','real336@example.net','realfixture336')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES
 ('cccccccc-3360-0000-0000-000000000003','test8@familiada.online','pending'),
 ('aaaaaaaa-3360-0000-0000-000000000001','real336@example.net','pending');
DO $$ DECLARE r jsonb; sid uuid; BEGIN
 IF has_function_privilege('anon','public.e2e_registered_subscriber_fixture(boolean)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.e2e_registered_subscriber_fixture(boolean)','EXECUTE') THEN RAISE EXCEPTION 'ACL'; END IF;
 IF public.e2e_registered_subscriber_fixture()->>'ok'<>'false' THEN RAISE EXCEPTION 'anonymous'; END IF;
 PERFORM set_config('request.jwt.claim.sub','cccccccc-3360-0000-0000-000000000003',true);
 IF public.e2e_registered_subscriber_fixture(true)->>'ok'<>'false' THEN RAISE EXCEPTION 'normal caller'; END IF;
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3360-0000-0000-000000000002',true);
 IF public.e2e_registered_subscriber_fixture()->>'ok'<>'false' THEN RAISE EXCEPTION 'recipient self fixture'; END IF;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3360-0000-0000-000000000001',true);
 r:=public.e2e_registered_subscriber_fixture(); sid:=(r->>'id')::uuid;
 IF r->>'ok'<>'true' OR NOT EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE id=sid AND status='active' AND email_send_count=0) THEN RAISE EXCEPTION 'fixture create'; END IF;
 r:=public.e2e_registered_subscriber_fixture();
 IF r->>'id'=sid::text OR (SELECT count(*) FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3360-0000-0000-000000000001' AND subscriber_email='test8@familiada.online')<>1 THEN RAISE EXCEPTION 'duplicate fixture'; END IF;
 PERFORM public.e2e_registered_subscriber_fixture(true);
 PERFORM public.e2e_registered_subscriber_fixture(true);
 IF EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3360-0000-0000-000000000001' AND subscriber_email='test8@familiada.online')
 OR (SELECT count(*) FROM public.poll_subscriptions)<>2 THEN RAISE EXCEPTION 'cleanup affects other owner/normal recipient'; END IF;
END $$;
ROLLBACK;
