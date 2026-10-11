\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3470-0000-0000-000000000001','a347@example.invalid'),('bbbbbbbb-3470-0000-0000-000000000002','b347@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3470-0000-0000-000000000001','a347@example.invalid','fixturea347'),('bbbbbbbb-3470-0000-0000-000000000002','b347@example.invalid','fixtureb347') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('friend:invite_after_reject','pair',2592000,true),('poll:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3470-0000-0000-000000000004','aaaaaaaa-3470-0000-0000-000000000001','Text347','poll_text','poll_open','text347'),
 ('dddddddd-3470-0000-0000-000000000005','aaaaaaaa-3470-0000-0000-000000000001','Points347','poll_points','poll_open','points347');
INSERT INTO public.questions(game_id,ord,text) SELECT g.id,n,'Q'||n FROM public.games g CROSS JOIN generate_series(1,10) n WHERE g.owner_id='aaaaaaaa-3470-0000-0000-000000000001';
INSERT INTO public.answers(question_id,ord,text) SELECT q.id,n,'A'||n FROM public.questions q CROSS JOIN generate_series(1,4) n WHERE q.game_id='dddddddd-3470-0000-0000-000000000005';
INSERT INTO public.poll_sessions(game_id,question_id,question_ord) SELECT game_id,id,ord FROM public.questions WHERE game_id IN ('dddddddd-3470-0000-0000-000000000004','dddddddd-3470-0000-0000-000000000005');
DO $$ DECLARE g record; tid uuid; tok uuid; fid uuid; sid uuid; stok uuid; voter text; items jsonb; n integer; pass integer; a uuid:='aaaaaaaa-3470-0000-0000-000000000001'; b uuid:='bbbbbbbb-3470-0000-0000-000000000002'; r jsonb;
BEGIN
 IF has_function_privilege('authenticated','public._poll_share_contact_locks(uuid,uuid[],uuid[])','EXECUTE') OR has_function_privilege('anon','public._poll_task_cleanup_partial_votes()','EXECUTE') THEN RAISE EXCEPTION 'private cleanup granted'; END IF;
 FOR g IN SELECT * FROM public.games WHERE owner_id=a LOOP
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_id',ans.id,'answer_raw','Kot','answer_norm','kot') ORDER BY q.ord) INTO items FROM public.questions q LEFT JOIN public.answers ans ON ans.question_id=q.id AND ans.ord=1 WHERE q.game_id=g.id;
  FOR pass IN 1..5 LOOP
   IF pass=3 THEN
    PERFORM set_config('request.jwt.claim.sub','',true);
    INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) VALUES(a,'anon347@example.invalid',g.id,g.type::text,g.share_key_poll) RETURNING id,token INTO tid,tok;
    INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(a,'anon347@example.invalid','active') RETURNING id,token INTO sid,stok;
   ELSE
    PERFORM set_config('request.jwt.claim.sub',b::text,true);
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES(a,b,g.id,g.type::text,g.share_key_poll) RETURNING id,token INTO tid,tok;
   END IF;
   voter:=public.poll_task_voter_token(tid);
   IF g.type='poll_text' THEN PERFORM public.poll_text_submit_batch(g.id,g.share_key_poll,voter,CASE WHEN pass=5 THEN items ELSE jsonb_build_array(items->0) END);
   ELSE PERFORM public.poll_points_vote_batch(g.id,g.share_key_poll,voter,CASE WHEN pass=5 THEN items ELSE jsonb_build_array(items->0) END); END IF;
   IF pass=1 THEN DELETE FROM public.poll_tasks WHERE id=tid;
   ELSIF pass=2 THEN UPDATE public.poll_tasks SET status='cancelled',cancelled_at=now() WHERE id=tid;
   ELSIF pass=3 THEN
    r:=public.poll_sub_unsubscribe(stok);
    IF r->>'ok' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=tid AND status='cancelled') THEN RAISE EXCEPTION 'subscriber withdrawal %',r; END IF;
   ELSE
    INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES(a,b,'active') RETURNING id INTO fid;
    PERFORM set_config('request.jwt.claim.sub',CASE WHEN pass=4 THEN a::text ELSE b::text END,true);
    r:=public.friends_remove(fid);
    IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'friend withdrawal %',r; END IF;
    IF pass=4 AND EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=tid) THEN RAISE EXCEPTION 'friend task retained'; END IF;
    DELETE FROM public.friendships WHERE id=fid;
   END IF;
   IF g.type='poll_text' THEN SELECT count(*) INTO n FROM public.poll_text_entries WHERE voter_token=voter;
   ELSE SELECT count(*) INTO n FROM public.poll_votes WHERE voter_token=voter; END IF;
   IF n IS DISTINCT FROM (CASE WHEN pass=5 THEN 10 ELSE 0 END) THEN RAISE EXCEPTION 'wrong vote cleanup type% pass% n%',g.type,pass,n; END IF;
   IF pass=5 THEN
    IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=tid AND status='done') THEN RAISE EXCEPTION 'completed task removed by friend'; END IF;
    DELETE FROM public.poll_tasks WHERE id=tid;
    IF g.type='poll_text' THEN SELECT count(*) INTO n FROM public.poll_text_entries WHERE voter_token=voter;
    ELSE SELECT count(*) INTO n FROM public.poll_votes WHERE voter_token=voter; END IF;
    IF n<>10 THEN RAISE EXCEPTION 'completed aggregate lost on delete'; END IF;
   END IF;
   DELETE FROM public.poll_tasks WHERE id=tid;
   IF sid IS NOT NULL THEN DELETE FROM public.poll_subscriptions WHERE id=sid;sid:=NULL; END IF;
  END LOOP;
 END LOOP;
 RAISE NOTICE '347 cleanup OK: both poll types; delete/cancel/subscriber/friend withdrawal; completed aggregate retained';
END $$;
ROLLBACK;
