-- Isolated Postgres or rollback-only production smoke, no SMTP.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3480-0000-0000-000000000001','owner348@example.invalid'),
 ('bbbbbbbb-3480-0000-0000-000000000002','recipient348@example.invalid'),
 ('cccccccc-3480-0000-0000-000000000003','other348@example.invalid');
INSERT INTO public.profiles(id,email,username)
SELECT id,email,split_part(email,'@',1) FROM auth.users WHERE email IN ('owner348@example.invalid','recipient348@example.invalid','other348@example.invalid')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3480-0000-0000-000000000004','aaaaaaaa-3480-0000-0000-000000000001','Text348','poll_text','poll_open','text348'),
 ('dddddddd-3480-0000-0000-000000000005','aaaaaaaa-3480-0000-0000-000000000001','Points348','poll_points','poll_open','points348');
INSERT INTO public.questions(game_id,ord,text) SELECT g.id,n,'Q'||n FROM public.games g CROSS JOIN generate_series(1,10) n WHERE g.owner_id='aaaaaaaa-3480-0000-0000-000000000001';
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,n,'A'||n FROM public.questions q CROSS JOIN generate_series(1,4) n WHERE q.game_id='dddddddd-3480-0000-0000-000000000005';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id IN ('dddddddd-3480-0000-0000-000000000004','dddddddd-3480-0000-0000-000000000005');
DO $$ DECLARE g record; target text; tid uuid; tok uuid; items jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3480-0000-0000-000000000002',true);
 FOR g IN SELECT * FROM public.games WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001' LOOP
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',ans.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) INTO items FROM public.questions q LEFT JOIN public.answers ans ON ans.question_id=q.id AND ans.ord=1 WHERE q.game_id=g.id;
  FOREACH target IN ARRAY ARRAY['pending','opened','done','declined','cancelled'] LOOP
   INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES(g.owner_id,'bbbbbbbb-3480-0000-0000-000000000002',g.id,g.type::text,g.share_key_poll) RETURNING id,token INTO tid,tok;
   IF target='opened' AND public.poll_task_opened(tok) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'open fixture'; END IF;
   IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN target='done' THEN items ELSE jsonb_build_array(items->0) END);
   ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN target='done' THEN items ELSE jsonb_build_array(items->0) END); END IF;
   IF target IN ('declined','cancelled') THEN UPDATE public.poll_tasks SET status=target,declined_at=CASE WHEN target='declined' THEN now() END,cancelled_at=CASE WHEN target='cancelled' THEN now() END WHERE id=tid; END IF;
   IF (SELECT status FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM target THEN RAISE EXCEPTION 'wrong fixture state %',target; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE TEMP TABLE recipient348_snapshot ON COMMIT DROP AS SELECT * FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3480-0000-0000-000000000002';
INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll) VALUES
 ('aaaaaaaa-3480-0000-0000-000000000001','cccccccc-3480-0000-0000-000000000003',NULL,'dddddddd-3480-0000-0000-000000000004','poll_text','text348'),
 ('aaaaaaaa-3480-0000-0000-000000000001',NULL,'anonymous348@example.invalid','dddddddd-3480-0000-0000-000000000004','poll_text','text348');
INSERT INTO public.question_bases(id,owner_id,name) VALUES ('eeeeeeee-3480-0000-0000-000000000006','aaaaaaaa-3480-0000-0000-000000000001','Base348');
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,status)
SELECT 'aaaaaaaa-3480-0000-0000-000000000001','eeeeeeee-3480-0000-0000-000000000006','bbbbbbbb-3480-0000-0000-000000000002','recipient348@example.invalid',s FROM unnest(ARRAY['pending','opened','accepted','declined','cancelled']) s;
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email) VALUES
 ('aaaaaaaa-3480-0000-0000-000000000001','eeeeeeee-3480-0000-0000-000000000006','cccccccc-3480-0000-0000-000000000003','other348@example.invalid'),
 ('aaaaaaaa-3480-0000-0000-000000000001','eeeeeeee-3480-0000-0000-000000000006',NULL,'anonymous348@example.invalid');
INSERT INTO public.question_base_shares(base_id,user_id,role) VALUES
 ('eeeeeeee-3480-0000-0000-000000000006','bbbbbbbb-3480-0000-0000-000000000002','viewer'),
 ('eeeeeeee-3480-0000-0000-000000000006','cccccccc-3480-0000-0000-000000000003','viewer');
INSERT INTO public.poll_subscriptions(owner_id,subscriber_user_id,subscriber_email,status)
SELECT 'aaaaaaaa-3480-0000-0000-000000000001','bbbbbbbb-3480-0000-0000-000000000002',NULL,s FROM unnest(ARRAY['pending','active','declined','cancelled']) s;
INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES ('aaaaaaaa-3480-0000-0000-000000000001','anonymous348@example.invalid','active');
DELETE FROM auth.users WHERE id='bbbbbbbb-3480-0000-0000-000000000002';
DO $$ DECLARE t record; n integer; BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_tasks t JOIN recipient348_snapshot s USING(id)) THEN RAISE EXCEPTION 'recipient tasks retained'; END IF;
 IF EXISTS(SELECT 1 FROM public.base_share_tasks WHERE recipient_user_id='bbbbbbbb-3480-0000-0000-000000000002' OR recipient_email='recipient348@example.invalid') THEN RAISE EXCEPTION 'base invitations retained'; END IF;
 IF (SELECT count(*) FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001')<>1 THEN RAISE EXCEPTION 'legacy subscriber retained or anonymous removed'; END IF;
 IF (SELECT count(*) FROM public.poll_tasks WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001')<>2 OR (SELECT count(*) FROM public.base_share_tasks WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001')<>2 THEN RAISE EXCEPTION 'independent recipients affected'; END IF;
 IF (SELECT count(*) FROM public.question_base_shares WHERE base_id='eeeeeeee-3480-0000-0000-000000000006')<>1 THEN RAISE EXCEPTION 'base grants cascade'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 FOR t IN SELECT * FROM recipient348_snapshot LOOP
  IF public.poll_task_opened(t.token) IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'old task token usable'; END IF;
  IF t.poll_type='poll_text' THEN SELECT count(*) INTO n FROM public.poll_text_entries WHERE voter_token=public.poll_task_voter_token(t.id);
  ELSE SELECT count(*) INTO n FROM public.poll_votes WHERE voter_token=public.poll_task_voter_token(t.id); END IF;
  IF n IS DISTINCT FROM (CASE WHEN t.status='done' THEN 10 ELSE 0 END) THEN RAISE EXCEPTION 'wrong aggregate cleanup % %',t.status,n; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.games WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001')<>2 THEN RAISE EXCEPTION 'recipient removed owner games'; END IF;
 DELETE FROM auth.users WHERE id='aaaaaaaa-3480-0000-0000-000000000001';
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM public.base_share_tasks WHERE owner_id='aaaaaaaa-3480-0000-0000-000000000001') THEN RAISE EXCEPTION 'owner cascade incomplete'; END IF;
 RAISE NOTICE '348 all states/types: recipient cascade, tokens unavailable, partial removed, completed retained, independent and anonymous preserved, owner cascade';
END $$;
ROLLBACK;
