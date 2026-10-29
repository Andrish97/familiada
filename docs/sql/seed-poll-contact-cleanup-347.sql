-- Isolated Postgres only. Historical cancelled partials and completed aggregates.
\set ON_ERROR_STOP on
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3471-0000-0000-000000000001','legacy347@example.invalid');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3471-0000-0000-000000000004','aaaaaaaa-3471-0000-0000-000000000001','Legacy text347','poll_text','poll_open','legacytext347'),
 ('dddddddd-3471-0000-0000-000000000005','aaaaaaaa-3471-0000-0000-000000000001','Legacy points347','poll_points','poll_open','legacypoints347');
INSERT INTO public.questions(game_id,ord,text) SELECT g.id,n,'Q'||n FROM public.games g CROSS JOIN generate_series(1,2)n WHERE g.owner_id='aaaaaaaa-3471-0000-0000-000000000001';
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,1,'A' FROM public.questions q WHERE q.game_id='dddddddd-3471-0000-0000-000000000005';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id IN ('dddddddd-3471-0000-0000-000000000004','dddddddd-3471-0000-0000-000000000005');
DO $$ DECLARE g record; tid uuid; items jsonb; pass integer;
BEGIN
 FOR g IN SELECT * FROM public.games WHERE owner_id='aaaaaaaa-3471-0000-0000-000000000001' LOOP
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',a.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=g.id;
  FOR pass IN 1..2 LOOP
   INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES(g.owner_id,'legacyrecipient347@example.invalid',g.id,g.type::text,g.share_key_poll) RETURNING id INTO tid;
   IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN pass=1 THEN jsonb_build_array(items->0) ELSE items END);
   ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,public.poll_task_voter_token(tid),CASE WHEN pass=1 THEN jsonb_build_array(items->0) ELSE items END); END IF;
   IF pass=1 THEN UPDATE public.poll_tasks SET status='cancelled',cancelled_at=now() WHERE id=tid;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=tid AND status='done' AND done_at IS NOT NULL) THEN RAISE EXCEPTION 'legacy aggregate not completed'; END IF;
    DELETE FROM public.poll_tasks WHERE id=tid;
   END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3471-0000-0000-000000000004')<>3 OR (SELECT count(*) FROM public.poll_votes WHERE game_id='dddddddd-3471-0000-0000-000000000005')<>3 THEN RAISE EXCEPTION 'legacy partials not reproduced'; END IF;
END $$;
