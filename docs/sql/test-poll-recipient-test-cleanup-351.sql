-- Rollback-only test-helper scope; never registers mailbox14.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='test7@familiada.online') THEN
  INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3513-0000-0000-000000000001','test7@familiada.online');
 END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES('bbbbbbbb-3513-0000-0000-000000000002','other351cleanup@example.invalid');
DO $$ DECLARE a uuid; b uuid:='bbbbbbbb-3513-0000-0000-000000000002'; e text; BEGIN
 SELECT id INTO STRICT a FROM auth.users WHERE lower(email)='test7@familiada.online';
 INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES
 ('cccccccc-3513-0000-0000-000000000003',a,'test15@familiada.online','active'),
 ('dddddddd-3513-0000-0000-000000000004',b,'test15@familiada.online','active');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOREACH e IN ARRAY ARRAY['test9@familiada.online','test10@familiada.online','test11@familiada.online','test12@familiada.online','test13@familiada.online','ordinary@example.invalid',NULL] LOOP
  IF public.e2e_subscriber_email_cleanup(e)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'forbidden cleanup %',e; END IF;
 END LOOP;
 IF public.e2e_subscriber_email_cleanup('test15@familiada.online')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'dedicated15 cleanup refused'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE id='cccccccc-3513-0000-0000-000000000003') OR NOT EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE id='dddddddd-3513-0000-0000-000000000004') THEN RAISE EXCEPTION 'wrong cleanup owner scope'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.e2e_subscriber_email_cleanup('test15@familiada.online')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'ordinary caller cleanup'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.e2e_subscriber_email_cleanup('test15@familiada.online')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'anonymous cleanup'; END IF;
 RAISE NOTICE '351 helper: dedicated15 only in addition to14; caller pool1-8 and owner scope retained';
END $$;
ROLLBACK;
