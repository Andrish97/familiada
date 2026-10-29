-- Rollback-only production smoke: no SMTP or persistent account changes.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='test7@familiada.online') THEN
  INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3490-0000-0000-000000000001','test7@familiada.online');
 END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES ('bbbbbbbb-3490-0000-0000-000000000002','other349@example.invalid');
CREATE TEMP TABLE cleanup349_ids(id uuid, recipient text) ON COMMIT DROP;
INSERT INTO cleanup349_ids SELECT gen_random_uuid(), e FROM unnest(ARRAY['test11@familiada.online','test12@familiada.online','test9@familiada.online','other@example.invalid']) e;
DO $$ DECLARE a uuid; b uuid := 'bbbbbbbb-3490-0000-0000-000000000002'; r jsonb; e text; BEGIN
 SELECT id INTO STRICT a FROM auth.users WHERE lower(email)='test7@familiada.online';
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key)
 SELECT id,a,md5(recipient) FROM cleanup349_ids;
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key) VALUES(gen_random_uuid(),b,md5('test12@familiada.online'));
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOREACH e IN ARRAY ARRAY['test9@familiada.online','test10@familiada.online','test13@familiada.online','ordinary@example.invalid'] LOOP
  r:=public.e2e_poll_mail_budget_cleanup(e);
  IF r->>'err' IS DISTINCT FROM 'test_accounts_required' THEN RAISE EXCEPTION 'forbidden recipient allowed %',e; END IF;
 END LOOP;
 FOREACH e IN ARRAY ARRAY['test11@familiada.online','test12@familiada.online'] LOOP
  r:=public.e2e_poll_mail_budget_cleanup(e);
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'dedicated cleanup rejected %',e; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE queue_id IN(SELECT id FROM cleanup349_ids))<>2 THEN RAISE EXCEPTION 'wrong recipient scope'; END IF;
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE owner_id=b)<>1 THEN RAISE EXCEPTION 'other owner mutated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.e2e_poll_mail_budget_cleanup('test12@familiada.online')->>'err' IS DISTINCT FROM 'test_accounts_required' THEN RAISE EXCEPTION 'ordinary caller allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.e2e_poll_mail_budget_cleanup('test12@familiada.online')->>'err' IS DISTINCT FROM 'test_accounts_required' THEN RAISE EXCEPTION 'anonymous allowed'; END IF;
 IF has_function_privilege('anon','public.e2e_poll_mail_budget_cleanup(text)','execute') THEN RAISE EXCEPTION 'anon ACL'; END IF;
 RAISE NOTICE '349 allowed11/12, denied9/10/13, caller and ownership scope verified';
END $$;
ROLLBACK;
