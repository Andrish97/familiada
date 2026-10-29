\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3410-0000-0000-000000000001','owner341@example.net'),
 ('bbbbbbbb-3410-0000-0000-000000000002','recipient341@example.net'),
 ('cccccccc-3410-0000-0000-000000000003','foreign341@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3410-0000-0000-000000000001','owner341@example.net','owner341'),
 ('bbbbbbbb-3410-0000-0000-000000000002','recipient341@example.net','recipient341'),
 ('cccccccc-3410-0000-0000-000000000003','foreign341@example.net','foreign341')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3410-0000-0000-000000000004','aaaaaaaa-3410-0000-0000-000000000001','Boundaries341','poll_text','poll_open','run341');
INSERT INTO public.questions(game_id,ord,text) SELECT 'dddddddd-3410-0000-0000-000000000004',n,'Q'||n FROM generate_series(1,10) n;
DO $$ DECLARE
 o uuid:='aaaaaaaa-3410-0000-0000-000000000001'; u uuid:='bbbbbbbb-3410-0000-0000-000000000002';
 x uuid:='cccccccc-3410-0000-0000-000000000003'; g uuid:='dddddddd-3410-0000-0000-000000000004';
 tid uuid; tok uuid; first_decline timestamptz; j jsonb; mode text;
BEGIN
 INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES(o,u,g,'poll_text','run341') RETURNING id,token INTO tid,tok;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.poll_task_resolve(tok)->>'requires_auth' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'anonymous resolve'; END IF;
 j:=public.poll_go_resolve(tok); IF j->>'recipient_user_id' IS DISTINCT FROM u::text THEN RAISE EXCEPTION 'anonymous Go %',j; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=tid AND opened_at IS NOT NULL) THEN RAISE EXCEPTION 'unauth opened account task'; END IF;
 FOREACH mode IN ARRAY ARRAY['open','decline','done'] LOOP
  IF public._poll_task_change(tok,mode) IS DISTINCT FROM 'not_your_task' THEN RAISE EXCEPTION 'anonymous decision %',mode; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',x::text,true);
 IF public.poll_task_resolve(tok)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign resolve'; END IF;
 IF public.polls_hub_task_decline(tid) THEN RAISE EXCEPTION 'foreign Tasks decline'; END IF;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'not_your_task' OR public.poll_go_task_action(tok,'decline','recipient341@example.net') THEN RAISE EXCEPTION 'foreign decline'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 IF public.poll_task_done(tok) IS DISTINCT FROM 'not_your_task' THEN RAISE EXCEPTION 'owner cannot vote recipient'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF public.poll_task_opened(tok) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'own open'; END IF;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'own decline'; END IF;
 SELECT declined_at INTO first_decline FROM public.poll_tasks WHERE id=tid;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'already_used' OR public.poll_task_done(tok) IS DISTINCT FROM 'already_used' THEN RAISE EXCEPTION 'closed mutation'; END IF;
 IF (SELECT declined_at FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM first_decline THEN RAISE EXCEPTION 'refreshed refusal'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 PERFORM public.poll_admin_delete_vote(g,public.poll_task_voter_token(tid));
 IF (SELECT status FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'delete vote undoes refusal'; END IF;
 PERFORM public.poll_share_remove(g,tid);
 PERFORM public.poll_admin_delete_vote(g,public.poll_task_voter_token(tid));
 IF (SELECT status FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION 'delete vote reactivates cancelled'; END IF;

 -- Email token without account is a capability; arbitrary supplied email never reassigns it.
 INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES(o,'anonymous341@example.net',g,'poll_text','run341') RETURNING id,token INTO tid,tok;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF NOT public.poll_go_task_action(tok,'open','attacker@example.net') THEN RAISE EXCEPTION 'anonymous email open'; END IF;
 IF (SELECT recipient_email FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM 'anonymous341@example.net' THEN RAISE EXCEPTION 'recipient reassignment'; END IF;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'email decline'; END IF;

 -- Registered former email recipient must use its own login.
 INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES(o,'recipient341@example.net',g,'poll_text','run341') RETURNING id,token INTO tid,tok;
 IF public.poll_task_resolve(tok)->>'requires_auth' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'registered email no login'; END IF;
 IF public.poll_go_resolve(tok)->>'recipient_user_id' IS DISTINCT FROM u::text THEN RAISE EXCEPTION 'Go registered email'; END IF;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'not_your_task' THEN RAISE EXCEPTION 'registered email anonymous decline'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF public.poll_task_done(tok) IS DISTINCT FROM 'votes_incomplete' THEN RAISE EXCEPTION 'completion without votes'; END IF;
 INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT g,id,ord FROM public.questions WHERE game_id=g;
 PERFORM public.poll_text_submit_batch(g,'run341',public.poll_task_voter_token(tid),
  (SELECT jsonb_agg(jsonb_build_object('question_id',id,'answer_raw','Kot','answer_norm','kot')) FROM public.questions WHERE game_id=g));
 IF public.poll_task_done(tok) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'registered email completion'; END IF;
 IF public.poll_task_resolve(tok)->>'error' IS DISTINCT FROM 'already_done' THEN RAISE EXCEPTION 'done resolve'; END IF;

 -- Parent state/current key/type blocks every mutation.
 INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES(o,u,g,'poll_text','run341') RETURNING id,token INTO tid,tok;
 UPDATE public.games SET status='poll_stopped' WHERE id=g;
 FOREACH mode IN ARRAY ARRAY['open','decline','done'] LOOP
  IF public._poll_task_change(tok,mode) IS DISTINCT FROM 'poll_stopped' THEN RAISE EXCEPTION 'stopped mutation %',mode; END IF;
 END LOOP;
 IF public.polls_hub_task_decline(tid) THEN RAISE EXCEPTION 'Tasks bypass stopped guard'; END IF;
 UPDATE public.games SET status='ready' WHERE id=g;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'poll_closed' THEN RAISE EXCEPTION 'closed mutation'; END IF;
 UPDATE public.games SET status='poll_open',share_key_poll='new341' WHERE id=g;
 IF public.poll_task_opened(tok) IS DISTINCT FROM 'expired' OR public.poll_go_resolve(tok)->>'error' IS DISTINCT FROM 'expired' THEN RAISE EXCEPTION 'expired token'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=tid AND opened_at IS NOT NULL) THEN RAISE EXCEPTION 'expired marks opened'; END IF;
 DELETE FROM public.games WHERE id=g;
 IF public.poll_task_decline(tok) IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'deleted parent decision'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id=g) THEN RAISE EXCEPTION 'deleted parent physical cascade'; END IF;
 IF has_function_privilege('authenticated','public._poll_task_change(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.poll_task_send(uuid,text,text[])','EXECUTE') THEN RAISE EXCEPTION 'old/private function granted'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='poll_tasks' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')) THEN RAISE EXCEPTION 'direct write policy'; END IF;
END $$;
ROLLBACK;
