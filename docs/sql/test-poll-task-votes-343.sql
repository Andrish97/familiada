\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3430-0000-0000-000000000001','owner343@example.net'),
 ('bbbbbbbb-3430-0000-0000-000000000002','recipient343@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3430-0000-0000-000000000001','owner343@example.net','owner343'),
 ('bbbbbbbb-3430-0000-0000-000000000002','recipient343@example.net','recipient343')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3430-0000-0000-000000000004','aaaaaaaa-3430-0000-0000-000000000001','Votes343','poll_text','poll_open','run343');
INSERT INTO public.questions(game_id,ord,text) SELECT 'dddddddd-3430-0000-0000-000000000004',n,'Q'||n FROM generate_series(1,10) n;
DO $$ DECLARE
 o uuid:='aaaaaaaa-3430-0000-0000-000000000001'; u uuid:='bbbbbbbb-3430-0000-0000-000000000002';
 g uuid:='dddddddd-3430-0000-0000-000000000004'; tid uuid; tok uuid; qid uuid; sid uuid; voter text; f text; mode text; key text;
BEGIN
 INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll)
 VALUES(o,u,g,'poll_text','run343') RETURNING id,token INTO tid,tok;
 voter:=public.poll_task_voter_token(tid);
 SELECT id INTO qid FROM public.questions WHERE game_id=g AND ord=1;
 INSERT INTO public.poll_sessions(game_id,question_id,question_ord) VALUES(g,qid,1) RETURNING id INTO sid;
 -- Empty batches still validate capability: no silent bypass through any writer.
 FOREACH f IN ARRAY ARRAY['poll_points_vote_batch','poll_text_submit_batch','poll_points_vote_batch_owner','poll_text_submit_batch_owner'] LOOP
  PERFORM set_config('request.jwt.claim.sub',o::text,true);
  BEGIN
   IF right(f,6)='_owner' THEN EXECUTE format('SELECT public.%I($1,$2,$3)',f) USING g,'[]'::jsonb,voter;
   ELSE EXECUTE format('SELECT public.%I($1,$2,$3,$4)',f) USING g,'run343',voter,'[]'::jsonb; END IF;
   RAISE EXCEPTION 'bypass %',f;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Not your task%' THEN RAISE; END IF; END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public._poll_assert_voter(g,'run343',voter); RAISE EXCEPTION 'anonymous account vote';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Not your task%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM public._poll_assert_voter(g,'run343',voter);
 PERFORM public.poll_text_submit_batch(g,'run343',voter,jsonb_build_array(jsonb_build_object('question_id',qid,'answer_raw','Kot','answer_norm','kot')));
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id=g AND voter_token=voter)<>1 THEN RAISE EXCEPTION 'valid vote missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 BEGIN
  INSERT INTO public.poll_text_entries(game_id,poll_session_id,question_id,voter_token,answer_raw,answer_norm) VALUES(g,sid,qid,voter,'Kot','kot');
  RAISE EXCEPTION 'direct owner task bypass';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Not your task%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 FOREACH mode IN ARRAY ARRAY['declined','cancelled','done'] LOOP
  UPDATE public.poll_tasks SET status=mode WHERE id=tid;
  BEGIN PERFORM public._poll_assert_voter(g,'run343',voter); RAISE EXCEPTION 'closed vote %',mode;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Task unavailable%' THEN RAISE; END IF; END;
 END LOOP;
 UPDATE public.poll_tasks SET status='pending',declined_at=now() WHERE id=tid;
 BEGIN PERFORM public._poll_assert_voter(g,'run343',voter); RAISE EXCEPTION 'decline stamp bypass';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Task unavailable%' THEN RAISE; END IF; END;
 UPDATE public.poll_tasks SET declined_at=NULL,cancelled_at=NULL,done_at=NULL,recipient_user_id=NULL,recipient_email='anonymous343@example.net' WHERE id=tid;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM public._poll_assert_voter(g,'run343',voter);
 UPDATE public.poll_tasks SET recipient_email='recipient343@example.net' WHERE id=tid;
 BEGIN PERFORM public._poll_assert_voter(g,'run343',voter); RAISE EXCEPTION 'legacy registered vote';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Not your task%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM public._poll_assert_voter(g,'run343',voter);
 UPDATE public.games SET share_key_poll='next343' WHERE id=g;
 BEGIN PERFORM public._poll_assert_voter(g,'next343',voter); RAISE EXCEPTION 'old run vote';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Task expired%' THEN RAISE; END IF; END;
 FOREACH key IN ARRAY ARRAY[NULL::text,'run343'] LOOP
  BEGIN PERFORM public._poll_assert_voter(g,key,'anonymous-token'); RAISE EXCEPTION 'invalid key bypass';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Invalid poll key%' THEN RAISE; END IF; END;
 END LOOP;
 PERFORM public._poll_assert_voter(g,'next343','anonymous-token');
 BEGIN PERFORM public._poll_assert_voter(g,'next343','task:bad'); RAISE EXCEPTION 'malformed task token';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Invalid task voter token%' THEN RAISE; END IF; END;
 BEGIN PERFORM public._poll_assert_voter(g,'next343','task:eeeeeeee-3430-0000-0000-000000000005'); RAISE EXCEPTION 'unknown task';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Task unavailable%' THEN RAISE; END IF; END;
 FOREACH mode IN ARRAY ARRAY['poll_stopped','ready','draft'] LOOP
  UPDATE public.games SET status=mode::public.game_status WHERE id=g;
  BEGIN PERFORM public._poll_assert_voter(g,'next343','anonymous-token'); RAISE EXCEPTION 'parent state bypass';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Poll is not open%' THEN RAISE; END IF; END;
 END LOOP;
 IF has_function_privilege('authenticated','public._poll_assert_voter(uuid,text,text)','EXECUTE')
 OR has_function_privilege('anon','public._poll_assert_voter(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'private guard granted'; END IF;
END $$;
ROLLBACK;
