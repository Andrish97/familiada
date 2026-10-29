-- Rollback-only production smoke: no SMTP or persistent account changes.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='test7@familiada.online') THEN
  INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3500-0000-0000-000000000001','test7@familiada.online');
 END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES ('bbbbbbbb-3500-0000-0000-000000000002','other350@example.invalid');
CREATE TEMP TABLE cleanup350_ids(id uuid, recipient text) ON COMMIT DROP;
INSERT INTO cleanup350_ids SELECT gen_random_uuid(), e FROM unnest(ARRAY['test11@familiada.online','test12@familiada.online','test15@familiada.online','test9@familiada.online','other@example.invalid']) e;
DO $$ DECLARE a uuid; b uuid := 'bbbbbbbb-3500-0000-0000-000000000002'; r jsonb; e text; BEGIN
 SELECT id INTO STRICT a FROM auth.users WHERE lower(email)='test7@familiada.online';
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key)
 SELECT id,a,md5(recipient) FROM cleanup350_ids;
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key) VALUES(gen_random_uuid(),b,md5('test12@familiada.online'));
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOREACH e IN ARRAY ARRAY['test9@familiada.online','test10@familiada.online','test13@familiada.online','ordinary@example.invalid'] LOOP
  r:=public.e2e_poll_mail_budget_cleanup(e);
  IF r->>'err' IS DISTINCT FROM 'test_accounts_required' THEN RAISE EXCEPTION 'forbidden recipient allowed %',e; END IF;
 END LOOP;
 FOREACH e IN ARRAY ARRAY['test11@familiada.online','test12@familiada.online','test15@familiada.online'] LOOP
  r:=public.e2e_poll_mail_budget_cleanup(e);
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'dedicated cleanup rejected %',e; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE queue_id IN(SELECT id FROM cleanup350_ids))<>2 THEN RAISE EXCEPTION 'wrong recipient scope'; END IF;
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE owner_id=b)<>1 THEN RAISE EXCEPTION 'other owner mutated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.e2e_poll_mail_budget_cleanup('test12@familiada.online')->>'err' IS DISTINCT FROM 'test_accounts_required' THEN RAISE EXCEPTION 'ordinary caller allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.e2e_poll_mail_budget_cleanup('test12@familiada.online')->>'err' IS DISTINCT FROM 'test_accounts_required' THEN RAISE EXCEPTION 'anonymous allowed'; END IF;
 IF has_function_privilege('anon','public.e2e_poll_mail_budget_cleanup(text)','execute') THEN RAISE EXCEPTION 'anon ACL'; END IF;
 INSERT INTO public.e2e_emails(recipient,subject,body) VALUES('test15@familiada.online','fixture350','fixture');
 BEGIN
  INSERT INTO public.e2e_emails(recipient,subject,body) VALUES('test16@familiada.online','fixture350','fixture');
  RAISE EXCEPTION 'mailbox16 accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='test15@familiada.online') THEN
  INSERT INTO auth.users(id,email) VALUES('cccccccc-3500-0000-0000-000000000003','test15@familiada.online');
 END IF;
 INSERT INTO public.profiles(id,email,username)
 SELECT id,email,'test15' FROM auth.users WHERE lower(email)='test15@familiada.online' ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.stats_exclusions_effective x JOIN auth.users u ON u.id=x.user_id WHERE lower(u.email)='test15@familiada.online' AND x.reason IN('test_account','manual')) THEN RAISE EXCEPTION 'admin exception15 missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF public.e2e_friendships_cleanup((SELECT id FROM auth.users WHERE lower(email)='test15@familiada.online'))->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'friend cleanup15 rejected'; END IF;
 RAISE NOTICE '350 dedicated15 mailbox, admin exception and pair cleanup verified';
END $$;
ROLLBACK;
