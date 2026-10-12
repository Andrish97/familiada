BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('poll:share','pair',300,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
('aaaaaaaa-3530-0000-0000-000000000001','owner353@example.invalid','{"username":"owner353"}'),
('cccccccc-3530-0000-0000-000000000003','friend353@example.invalid','{"username":"friend353"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status)
VALUES('eeeeeeee-3530-0000-0000-000000000005','aaaaaaaa-3530-0000-0000-000000000001','recipient353@example.invalid','active');
INSERT INTO public.friendships(id,requester_id,addressee_id,status)
VALUES('ffffffff-3530-0000-0000-000000000006','aaaaaaaa-3530-0000-0000-000000000001','cccccccc-3530-0000-0000-000000000003','active');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
('dddddddd-3530-0000-0000-000000000004','aaaaaaaa-3530-0000-0000-000000000001','Source text353','poll_text','poll_open','source353-text'),
('dddddddd-3530-0000-0000-000000000005','aaaaaaaa-3530-0000-0000-000000000001','Source points353','poll_points','poll_open','source353-points');
INSERT INTO public.questions(game_id,ord,text) SELECT g,n,'Q'||n FROM unnest(ARRAY['dddddddd-3530-0000-0000-000000000004'::uuid,'dddddddd-3530-0000-0000-000000000005'::uuid])g CROSS JOIN generate_series(1,10)n;
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,n,'A'||n FROM public.questions q CROSS JOIN generate_series(1,4)n WHERE q.game_id='dddddddd-3530-0000-0000-000000000005';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id IN ('dddddddd-3530-0000-0000-000000000004','dddddddd-3530-0000-0000-000000000005');
DO $$ DECLARE g record; st text; tid uuid; tok uuid; items jsonb; response jsonb; BEGIN
 FOR g IN SELECT * FROM public.games WHERE id IN ('dddddddd-3530-0000-0000-000000000004','dddddddd-3530-0000-0000-000000000005') LOOP
  PERFORM set_config('request.jwt.claim.sub',g.owner_id::text,true);
  response:=public.poll_share_send(g.id,ARRAY['cccccccc-3530-0000-0000-000000000003'::uuid],ARRAY['eeeeeeee-3530-0000-0000-000000000005'::uuid]);
  IF response->>'created'<>'2' THEN RAISE EXCEPTION 'public share fixture %',response; END IF;
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=g.id;
  PERFORM set_config('request.jwt.claim.sub','',true);
  FOREACH st IN ARRAY ARRAY['opened','done','declined','cancelled'] LOOP
   INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,source_subscription_id) VALUES(g.owner_id,'recipient353@example.invalid',g.id,g.type::text,g.share_key_poll,'eeeeeeee-3530-0000-0000-000000000005') RETURNING id,token INTO tid,tok;
   IF st='opened' THEN PERFORM public.poll_task_opened(tok); END IF;
   IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN st='done' THEN items ELSE jsonb_build_array(items->0) END);
   ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN st='done' THEN items ELSE jsonb_build_array(items->0) END); END IF;
   IF st IN ('declined','cancelled') THEN UPDATE public.poll_tasks SET status=st WHERE id=tid; END IF;
   IF (SELECT status FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM st THEN RAISE EXCEPTION 'state %',st; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE TEMP TABLE source353_tasks ON COMMIT DROP AS SELECT id,token,status,game_id FROM public.poll_tasks WHERE source_subscription_id='eeeeeeee-3530-0000-0000-000000000005';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('bbbbbbbb-3530-0000-0000-000000000002','recipient353@example.invalid','{"username":"recipient353"}');
UPDATE auth.users SET email='changed353@example.invalid' WHERE id='bbbbbbbb-3530-0000-0000-000000000002';
UPDATE public.profiles SET email='changed353@example.invalid' WHERE id='bbbbbbbb-3530-0000-0000-000000000002';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.poll_tasks WHERE id IN(SELECT id FROM source353_tasks) AND source_subscription_id='eeeeeeee-3530-0000-0000-000000000005' AND recipient_user_id='bbbbbbbb-3530-0000-0000-000000000002' AND recipient_email IS NULL)<>10 THEN RAISE EXCEPTION 'source/identity lost after signup/email change'; END IF;
 IF (SELECT registered_user_id FROM public.poll_subscriptions WHERE id='eeeeeeee-3530-0000-0000-000000000005') IS DISTINCT FROM 'bbbbbbbb-3530-0000-0000-000000000002'::uuid THEN RAISE EXCEPTION 'source holder lost'; END IF;
 PERFORM set_config('request.jwt.claim.sub','cccccccc-3530-0000-0000-000000000003',true);
 IF public.polls_hub_subscriber_remove('eeeeeeee-3530-0000-0000-000000000005')->>'ok'='true' THEN RAISE EXCEPTION 'nonowner removed source'; END IF;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3530-0000-0000-000000000001',true);
 IF public.polls_hub_subscriber_remove('eeeeeeee-3530-0000-0000-000000000005')->>'ok'<>'true' THEN RAISE EXCEPTION 'owner source removal failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id IN(SELECT id FROM source353_tasks WHERE status IN('pending','opened'))) THEN RAISE EXCEPTION 'revoked live tasks survived'; END IF;
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3530-0000-0000-000000000004')<>10 OR (SELECT count(*) FROM public.poll_votes WHERE game_id='dddddddd-3530-0000-0000-000000000005')<>10 THEN RAISE EXCEPTION 'partial retained or complete lost'; END IF;
 IF (SELECT count(*) FROM public.poll_tasks WHERE source_friendship_id='ffffffff-3530-0000-0000-000000000006')<>2 THEN RAISE EXCEPTION 'independent friend grants lost'; END IF;
END $$;
DELETE FROM public.poll_subscriptions WHERE id='eeeeeeee-3530-0000-0000-000000000005';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id IN(SELECT id FROM source353_tasks)) THEN RAISE EXCEPTION 'source cascade left tasks'; END IF;
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3530-0000-0000-000000000004')<>10 OR (SELECT count(*) FROM public.poll_votes WHERE game_id='dddddddd-3530-0000-0000-000000000005')<>10 THEN RAISE EXCEPTION 'cascade lost completed aggregate'; END IF;
 RAISE NOTICE '353 source prototype: public share, both types/five states, signup/email, owner/nonowner revoke, independent friend access and completed votes passed';
END $$;
ROLLBACK;
