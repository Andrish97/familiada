\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3510-0000-0000-000000000001','owner351@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3510-0000-0000-000000000001','owner351@example.invalid','owner351') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3510-0000-0000-000000000004','aaaaaaaa-3510-0000-0000-000000000001','Identity text','poll_text','poll_open','key351-text'),
 ('dddddddd-3510-0000-0000-000000000005','aaaaaaaa-3510-0000-0000-000000000001','Identity points','poll_points','poll_open','key351-points');
INSERT INTO public.questions(game_id,ord,text) SELECT g,n,'Q'||n FROM unnest(ARRAY['dddddddd-3510-0000-0000-000000000004'::uuid,'dddddddd-3510-0000-0000-000000000005'::uuid]) g CROSS JOIN generate_series(1,10)n;
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,n,'A'||n FROM public.questions q CROSS JOIN generate_series(1,4)n WHERE game_id='dddddddd-3510-0000-0000-000000000005';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id IN('dddddddd-3510-0000-0000-000000000004','dddddddd-3510-0000-0000-000000000005');
DO $$ DECLARE g record; st text; tid uuid; tok uuid; items jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 FOR g IN SELECT * FROM public.games WHERE id IN('dddddddd-3510-0000-0000-000000000004','dddddddd-3510-0000-0000-000000000005') LOOP
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=g.id;
  FOREACH st IN ARRAY ARRAY['pending','opened','done','declined','cancelled'] LOOP
   INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES(g.owner_id,'legacy351@example.invalid',g.id,g.type::text,g.share_key_poll) RETURNING id,token INTO tid,tok;
   IF st='opened' THEN PERFORM public.poll_task_opened(tok); END IF;
   IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN st='done' THEN items ELSE jsonb_build_array(items->0) END);
   ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN st='done' THEN items ELSE jsonb_build_array(items->0) END); END IF;
   IF st IN('declined','cancelled') THEN UPDATE public.poll_tasks SET status=st WHERE id=tid; END IF;
   IF (SELECT status FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM st THEN RAISE EXCEPTION 'state fixture %',st; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE TEMP TABLE identity351_tasks ON COMMIT DROP AS SELECT * FROM public.poll_tasks WHERE recipient_email='legacy351@example.invalid';
INSERT INTO auth.users(id,email) VALUES('bbbbbbbb-3510-0000-0000-000000000002','legacy351@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('bbbbbbbb-3510-0000-0000-000000000002','legacy351@example.invalid','receiver351') ON CONFLICT(id) DO NOTHING;
DO $$ DECLARE t record; BEGIN
 IF (SELECT count(*) FROM public.poll_tasks WHERE id IN(SELECT id FROM identity351_tasks) AND recipient_user_id='bbbbbbbb-3510-0000-0000-000000000002' AND recipient_email IS NULL)<>10 THEN RAISE EXCEPTION 'registration did not bind all states'; END IF;
 FOR t IN SELECT * FROM identity351_tasks LOOP
  IF public.poll_task_opened(t.token) IS DISTINCT FROM 'not_your_task' THEN RAISE EXCEPTION 'anonymous access after registration'; END IF;
 END LOOP;
END $$;
-- Already-existing tasks at the new address are also captured by the same account.
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES('aaaaaaaa-3510-0000-0000-000000000001','changed351@example.invalid','dddddddd-3510-0000-0000-000000000004','poll_text','key351-text');
UPDATE auth.users SET email='changed351@example.invalid' WHERE id='bbbbbbbb-3510-0000-0000-000000000002';
UPDATE public.profiles SET email='changed351@example.invalid' WHERE id='bbbbbbbb-3510-0000-0000-000000000002';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('cccccccc-3510-0000-0000-000000000003','legacy351@example.invalid','{"username":"replacement351"}');
INSERT INTO public.profiles(id,email,username) VALUES('cccccccc-3510-0000-0000-000000000003','legacy351@example.invalid','new351') ON CONFLICT(id) DO NOTHING;
DO $$ DECLARE t record; BEGIN
 IF (SELECT count(*) FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3510-0000-0000-000000000002')<>11 THEN RAISE EXCEPTION 'new address tasks not bound'; END IF;
 PERFORM set_config('request.jwt.claim.sub','cccccccc-3510-0000-0000-000000000003',true);
 FOR t IN SELECT * FROM identity351_tasks LOOP
  IF public.poll_task_opened(t.token) IS DISTINCT FROM 'not_your_task' THEN RAISE EXCEPTION 'old address account took old task'; END IF;
 END LOOP;
END $$;
DELETE FROM auth.users WHERE id='bbbbbbbb-3510-0000-0000-000000000002';
INSERT INTO auth.users(id,email) VALUES('eeeeeeee-3510-0000-0000-000000000005','changed351@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('eeeeeeee-3510-0000-0000-000000000005','changed351@example.invalid','recreated351') ON CONFLICT(id) DO NOTHING;
DO $$ DECLARE t record; BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id IN(SELECT id FROM identity351_tasks)) THEN RAISE EXCEPTION 'deleted account left old task'; END IF;
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3510-0000-0000-000000000004')<>10 OR (SELECT count(*) FROM public.poll_votes WHERE game_id='dddddddd-3510-0000-0000-000000000005')<>10 THEN RAISE EXCEPTION 'partial not removed or complete lost'; END IF;
 PERFORM set_config('request.jwt.claim.sub','eeeeeeee-3510-0000-0000-000000000005',true);
 FOR t IN SELECT * FROM identity351_tasks LOOP
  IF public.poll_task_opened(t.token) IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'recreated account got old task'; END IF;
 END LOOP;
END $$;
-- Genuine guest conversion; the profile is authoritative for app guest status.
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES('ffffffff-3510-0000-0000-000000000006','guest351@example.invalid',true,'{"is_guest":true}');
INSERT INTO public.profiles(id,email,username,is_guest) VALUES('ffffffff-3510-0000-0000-000000000006','guest351@example.invalid','guest351',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES('aaaaaaaa-3510-0000-0000-000000000001','guest351@example.invalid','dddddddd-3510-0000-0000-000000000004','poll_text','key351-text');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_email='guest351@example.invalid') THEN RAISE EXCEPTION 'guest incorrectly claimed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','ffffffff-3510-0000-0000-000000000006',true);
 IF public.guest_convert_account('guest351@example.invalid')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'conversion failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_user_id='ffffffff-3510-0000-0000-000000000006' AND recipient_email IS NULL) THEN RAISE EXCEPTION 'conversion did not bind'; END IF;
END $$;
-- Changing only a profile address cannot steal email-only tasks.
INSERT INTO auth.users(id,email) VALUES('99999999-3510-0000-0000-000000000007','actual351@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('99999999-3510-0000-0000-000000000007','fake351@example.invalid','fake351') ON CONFLICT(id) DO UPDATE SET email=excluded.email;
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES('aaaaaaaa-3510-0000-0000-000000000001','fake351@example.invalid','dddddddd-3510-0000-0000-000000000004','poll_text','key351-text');
DO $$ DECLARE fake_id uuid; BEGIN
 SELECT id INTO fake_id FROM public.poll_tasks WHERE recipient_email='fake351@example.invalid';
 PERFORM set_config('request.jwt.claim.sub','99999999-3510-0000-0000-000000000007',true);
 PERFORM public.poll_claim_email_records();
 IF public.poll_my_email() IS DISTINCT FROM 'actual351@example.invalid' THEN RAISE EXCEPTION 'email getter trusts edited profile'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_email='fake351@example.invalid' AND recipient_user_id IS NULL) THEN RAISE EXCEPTION 'edited profile stole recipient'; END IF;
 IF EXISTS(SELECT 1 FROM public.tasks_list(NULL) WHERE id=fake_id) THEN RAISE EXCEPTION 'edited profile leaked task'; END IF;
 IF has_function_privilege('authenticated','public._poll_bind_identity(uuid,text)','execute') OR has_function_privilege('anon','public._poll_identity_refs(uuid[])','execute') THEN RAISE EXCEPTION 'private helper exposed'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.tasks_list(NULL) WHERE id=fake_id) THEN RAISE EXCEPTION 'authenticated task list leaked'; END IF;
 BEGIN
  IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=fake_id) THEN RAISE EXCEPTION 'RLS leaked task to edited profile'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 RAISE NOTICE '351 all states/text/points, registration/email change/reuse/delete, conversion and spoof guards passed';
END $$;
ROLLBACK;
