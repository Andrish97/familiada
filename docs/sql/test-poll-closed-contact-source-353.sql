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
UPDATE public.poll_subscriptions SET status='cancelled',cancelled_at=now() WHERE id='eeeeeeee-3530-0000-0000-000000000005';
DO $$ DECLARE t public.poll_tasks%rowtype; items jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 FOR t IN SELECT * FROM public.poll_tasks WHERE source_subscription_id='eeeeeeee-3530-0000-0000-000000000005' LOOP
  IF public.poll_go_resolve(t.token)->>'error' IS DISTINCT FROM 'expired' THEN RAISE EXCEPTION 'Go reopened closed source'; END IF;
  IF public.poll_task_opened(t.token) IS DISTINCT FROM 'expired' THEN RAISE EXCEPTION 'open ignored source state'; END IF;
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot')) INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=t.game_id AND q.ord=1;
  BEGIN
   IF t.poll_type='poll_text' THEN PERFORM public.poll_text_submit_batch(t.game_id,t.share_key_poll,public.poll_task_voter_token(t.id),items);
   ELSE PERFORM public.poll_points_vote_batch(t.game_id,t.share_key_poll,public.poll_task_voter_token(t.id),items); END IF;
   RAISE EXCEPTION 'vote ignored source state';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Task unavailable' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
DELETE FROM public.poll_subscriptions WHERE id='eeeeeeee-3530-0000-0000-000000000005';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE source_subscription_id='eeeeeeee-3530-0000-0000-000000000005') THEN RAISE EXCEPTION 'source hard delete left tasks'; END IF;
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3530-0000-0000-000000000004')<>10 OR (SELECT count(*) FROM public.poll_votes WHERE game_id='dddddddd-3530-0000-0000-000000000005')<>10 THEN RAISE EXCEPTION 'hard delete lost complete or retained partial'; END IF;
 RAISE NOTICE '353 closed parent: Go/open/both voting RPCs refuse all five states; source cascade preserves completed aggregates';
END $$;
ROLLBACK;
