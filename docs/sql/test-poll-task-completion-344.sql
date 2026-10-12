\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3440-0000-0000-000000000001','owner344@example.net');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3440-0000-0000-000000000004','aaaaaaaa-3440-0000-0000-000000000001','Text344','poll_text','poll_open','text344'),
 ('dddddddd-3440-0000-0000-000000000005','aaaaaaaa-3440-0000-0000-000000000001','Points344','poll_points','poll_open','points344');
INSERT INTO public.questions(game_id,ord,text) SELECT g.id,n,'Q'||n FROM public.games g CROSS JOIN generate_series(1,10) n WHERE g.owner_id='aaaaaaaa-3440-0000-0000-000000000001';
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,n,'A'||n FROM public.questions q CROSS JOIN generate_series(1,4) n WHERE q.game_id='dddddddd-3440-0000-0000-000000000005';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id IN ('dddddddd-3440-0000-0000-000000000004','dddddddd-3440-0000-0000-000000000005');
DO $$ DECLARE g record; tid uuid; tok uuid; voter text; items jsonb; done_at timestamptz; n integer; pass integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 FOR g IN SELECT * FROM public.games WHERE owner_id='aaaaaaaa-3440-0000-0000-000000000001' LOOP
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) INTO items
  FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=g.id;
  FOR pass IN 1..2 LOOP
   INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll)
   VALUES(g.owner_id,'anonymous344@example.net',g.id,g.type::text,g.share_key_poll) RETURNING id,token INTO tid,tok;
   voter:=public.poll_task_voter_token(tid);
   IF public.poll_task_done(tok) IS DISTINCT FROM 'votes_incomplete' THEN RAISE EXCEPTION 'fake done'; END IF;
   IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,voter,jsonb_build_array(items->0));
   ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,voter,jsonb_build_array(items->0)); END IF;
   IF (SELECT status FROM public.poll_tasks WHERE id=tid) IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'partial marked done'; END IF;
   IF public.poll_task_done(tok) IS DISTINCT FROM 'votes_incomplete' THEN RAISE EXCEPTION 'partial done'; END IF;
   IF pass=1 THEN
    IF public.poll_task_decline(tok) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'partial decline'; END IF;
    IF EXISTS(SELECT 1 FROM public.poll_votes WHERE voter_token=voter) OR EXISTS(SELECT 1 FROM public.poll_text_entries WHERE voter_token=voter) THEN RAISE EXCEPTION 'refusal retained votes'; END IF;
    IF public.poll_task_done(tok) IS DISTINCT FROM 'already_used' THEN RAISE EXCEPTION 'declined completion'; END IF;
   ELSE
    IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,voter,items-0);
    ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,voter,items-0); END IF;
    SELECT t.done_at INTO done_at FROM public.poll_tasks t WHERE id=tid AND status='done';
    IF done_at IS NULL THEN RAISE EXCEPTION 'final batch did not mark done'; END IF;
    IF public.poll_task_done(tok) IS DISTINCT FROM 'ok' OR (SELECT t.done_at FROM public.poll_tasks t WHERE id=tid) IS DISTINCT FROM done_at THEN RAISE EXCEPTION 'done idempotence'; END IF;
    IF public.poll_task_decline(tok) IS DISTINCT FROM 'already_used' THEN RAISE EXCEPTION 'completed task declined'; END IF;
    IF g.type='poll_text' THEN SELECT count(*) INTO n FROM public.poll_text_entries WHERE voter_token=voter;
    ELSE SELECT count(*) INTO n FROM public.poll_votes WHERE voter_token=voter; END IF;
    IF n<>10 THEN RAISE EXCEPTION 'complete votes lost'; END IF;
   END IF;
  END LOOP;
 END LOOP;
 IF has_function_privilege('authenticated','public._poll_task_finish_batch(uuid,text,text)','EXECUTE')
 OR has_function_privilege('anon','public._poll_task_has_all_votes(uuid)','EXECUTE') THEN RAISE EXCEPTION 'private completion granted'; END IF;
END $$;
ROLLBACK;
