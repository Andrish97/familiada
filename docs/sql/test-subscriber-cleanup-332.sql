-- Izolowany Postgres, rollback. test14 pozostaje adresem bez konta.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3320-0000-0000-000000000001','test7@familiada.online'),
 ('bbbbbbbb-3320-0000-0000-000000000002','test8@familiada.online'),
 ('cccccccc-3320-0000-0000-000000000003','non-test332@example.net');
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('baseline:recipient','pair',120,true),('poll:resend','pair',432000,true)
ON CONFLICT(action_key) DO NOTHING;
DO $$
DECLARE a uuid:='aaaaaaaa-3320-0000-0000-000000000001';
 b uuid:='bbbbbbbb-3320-0000-0000-000000000002';
 c uuid:='cccccccc-3320-0000-0000-000000000003';
 target text:='test14@familiada.online'; n integer;
BEGIN
 PERFORM public.mail_cooldown_reserve('baseline:recipient','pair:'||a||':'||md5(target));
 PERFORM public.mail_cooldown_reserve('baseline:recipient','pair:'||b||':'||md5(target));
 PERFORM public.mail_cooldown_reserve('baseline:recipient','pair:'||a||':'||md5('real332@example.net'));
 PERFORM public.mail_cooldown_reserve('poll:resend','pair:'||a||':email:'||md5(target));
 SELECT count(*) INTO n FROM public.mail_cooldowns;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.e2e_subscriber_email_cleanup(target)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'anonymous cleanup'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 IF public.e2e_subscriber_email_cleanup(target)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'non-test caller'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF public.e2e_subscriber_email_cleanup('real332@example.net')->>'ok' IS DISTINCT FROM 'false'
 OR public.e2e_subscriber_email_cleanup(NULL)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'non-test recipient'; END IF;
 IF (SELECT count(*) FROM public.mail_cooldowns)<>n THEN RAISE EXCEPTION 'forbidden cleanup changed rows'; END IF;
 IF public.e2e_subscriber_email_cleanup(' TEST14@FAMILIADA.ONLINE ')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'allowed cleanup'; END IF;
 IF EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:'||a||':'||md5(target))
 OR EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:'||a||':email:'||md5(target)) THEN RAISE EXCEPTION 'own cooldown remains'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:'||b||':'||md5(target))
 OR NOT EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:'||a||':'||md5('real332@example.net')) THEN RAISE EXCEPTION 'other pair cooldown erased'; END IF;
 IF public.e2e_subscriber_email_cleanup(target)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'cleanup not idempotent'; END IF;
 IF has_function_privilege('anon','public.e2e_subscriber_email_cleanup(text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.e2e_subscriber_email_cleanup(text)','EXECUTE') THEN RAISE EXCEPTION 'cleanup ACL'; END IF;
END; $$;
ROLLBACK;
