BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3620-0000-0000-000000000001','owner362@example.invalid',false,now(),'{"username":"owner362"}');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3620-0000-0000-000000000001','aaaaaaaa-3620-0000-0000-000000000001','Text362','poll_text','draft','text362'),
 ('cccccccc-3620-0000-0000-000000000002','aaaaaaaa-3620-0000-0000-000000000001','Points362','poll_points','draft','points362');
INSERT INTO public.questions(game_id,ord,text)
 SELECT g.id,n,'Question '||n FROM public.games g CROSS JOIN generate_series(1,10) n
 WHERE g.owner_id='aaaaaaaa-3620-0000-0000-000000000001';
INSERT INTO public.answers(question_id,ord,text,fixed_points)
 SELECT q.id,n,'Answer '||n,10 FROM public.questions q JOIN public.games g ON g.id=q.game_id CROSS JOIN generate_series(1,3) n
 WHERE g.owner_id='aaaaaaaa-3620-0000-0000-000000000001' AND g.type::text='poll_points';
DO $$
DECLARE kind text; game uuid; key text; items jsonb; response jsonb; before_rows integer; after_rows integer;
 browser uuid:=gen_random_uuid(); second_browser uuid:=gen_random_uuid(); voter uuid; next_voter uuid; ignored boolean; invalid jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3620-0000-0000-000000000001',true);
 PERFORM public.poll_open('cccccccc-3620-0000-0000-000000000001','text362');
 PERFORM public.poll_open('cccccccc-3620-0000-0000-000000000002','points362');
 PERFORM set_config('request.jwt.claim.sub','',true);
 FOREACH kind IN ARRAY ARRAY['poll_text','poll_points'] LOOP
  SELECT id,share_key_poll INTO game,key FROM public.games WHERE owner_id='aaaaaaaa-3620-0000-0000-000000000001' AND type::text=kind;
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_raw','Cat','answer_norm','cat','answer_id',a.id) ORDER BY q.ord)
   INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=game;
  voter:=gen_random_uuid(); next_voter:=gen_random_uuid();
  FOR invalid IN SELECT value FROM jsonb_array_elements('[null, {}, "bad", [null]]'::jsonb) LOOP
   response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,invalid);
   IF response->>'error' NOT IN('invalid_payload','incomplete_form') THEN RAISE EXCEPTION 'invalid shape accepted %',response; END IF;
  END LOOP;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,'[]');
  IF response->>'error' IS DISTINCT FROM 'incomplete_form' OR EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id=game) THEN RAISE EXCEPTION 'invalid form allocated a clock'; END IF;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,jsonb_set(items,'{1}',items->0));
  IF response->>'error' IS DISTINCT FROM 'incomplete_form' THEN RAISE EXCEPTION 'duplicate question accepted'; END IF;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,jsonb_set(items,'{0,question_id}','"invalid"'));
  IF response->>'error' IS DISTINCT FROM 'invalid_payload' THEN RAISE EXCEPTION 'invalid question did not fail safely'; END IF;
  IF kind='poll_text' THEN
   response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,jsonb_set(items,'{9,answer_raw}','""'));
  ELSE
   response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,jsonb_set(items,'{9,answer_id}',items->0->'answer_id'));
  END IF;
  IF response->>'error' IS DISTINCT FROM 'invalid_payload' OR EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id=game)
   OR EXISTS(SELECT 1 FROM public.poll_votes WHERE game_id=game) OR EXISTS(SELECT 1 FROM public.poll_text_entries WHERE game_id=game)
  THEN RAISE EXCEPTION 'bad answer committed partial votes or a rate clock'; END IF;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,items);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'first full % form failed %',kind,response; END IF;
  SELECT count(*) INTO before_rows FROM (
   SELECT id FROM public.poll_text_entries WHERE game_id=game UNION ALL SELECT id FROM public.poll_votes WHERE game_id=game
  ) votes;
  IF before_rows<>10 THEN RAISE EXCEPTION 'full form did not write ten votes: %',before_rows; END IF;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,items);
  IF response->>'already_submitted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'idempotent retry failed'; END IF;
  IF kind='poll_text' THEN response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,jsonb_set(items,'{0,answer_raw}','"Dog"'));
  ELSE response:=public.poll_anonymous_submit_prototype(game,key,browser,voter,jsonb_set(items,'{0,answer_id}',to_jsonb((SELECT id FROM public.answers WHERE question_id=(items->0->>'question_id')::uuid AND ord=2)::text))); END IF;
  IF response->>'error' IS DISTINCT FROM 'attempt_reused' THEN RAISE EXCEPTION 'retry rewrote a completed vote'; END IF;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,next_voter,items);
  IF response->>'error' IS DISTINCT FROM 'cooldown' OR (response->>'retry_after')::integer NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION '30 second rate missing %',response; END IF;
  response:=public.poll_anonymous_submit_prototype(game,key,second_browser,next_voter,items);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'independent browser was throttled'; END IF;
  ignored:=false;
  BEGIN
   IF kind='poll_text' THEN PERFORM public.poll_text_submit_batch(game,key,gen_random_uuid()::text,items);
   ELSE PERFORM public.poll_points_vote_batch(game,key,gen_random_uuid()::text,items); END IF;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='anonymous_full_form_required' THEN ignored:=true; ELSE RAISE; END IF; END;
  IF NOT ignored THEN RAISE EXCEPTION 'old anonymous RPC bypassed whole-form gate'; END IF;
  UPDATE public.poll_anonymous_limits_prototype SET next_allowed_at=clock_timestamp()-interval '1 second' WHERE game_id=game;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,gen_random_uuid(),items);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'expired rate still blocked'; END IF;
  SELECT count(*) INTO after_rows FROM (SELECT id FROM public.poll_text_entries WHERE game_id=game UNION ALL SELECT id FROM public.poll_votes WHERE game_id=game) votes;
  IF after_rows<>30 THEN RAISE EXCEPTION 'independent full votes overwritten: %',after_rows; END IF;
  UPDATE public.games SET status='poll_stopped' WHERE id=game;
  IF EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id=game) THEN RAISE EXCEPTION 'closed parent retained limiter'; END IF;
  IF public.poll_anonymous_submit_prototype(game,key,browser,gen_random_uuid(),items)->>'error' IS DISTINCT FROM 'closed' THEN RAISE EXCEPTION 'closed parent allowed votes'; END IF;
  UPDATE public.games SET status='poll_open',share_key_poll=key||'new' WHERE id=game;
  IF public.poll_anonymous_submit_prototype(game,key,browser,gen_random_uuid(),items)->>'error' IS DISTINCT FROM 'expired' THEN RAISE EXCEPTION 'old session accepted'; END IF;
  RAISE NOTICE 'Anonymous362 %: complete atomic form, idempotency, browser isolation, cooldown, legacy gate, closure and key rotation passed',kind;
 END LOOP;
 -- Both task kinds and owner-import batches retain their separate contract.
 FOREACH kind IN ARRAY ARRAY['poll_text','poll_points'] LOOP
  SELECT id,share_key_poll INTO game,key FROM public.games WHERE owner_id='aaaaaaaa-3620-0000-0000-000000000001' AND type::text=kind;
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_raw','Task','answer_norm','task','answer_id',a.id) ORDER BY q.ord)
   INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=game;
  FOR task_index IN 1..2 LOOP
   INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,status)
    VALUES('aaaaaaaa-3620-0000-0000-000000000001','task362-'||kind||task_index||'@example.invalid',game,kind,key,'pending') RETURNING id INTO voter;
   IF kind='poll_text' THEN PERFORM public.poll_text_submit_batch(game,key,'task:'||voter,items);
   ELSE PERFORM public.poll_points_vote_batch(game,key,'task:'||voter,items); END IF;
   IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=voter AND status='done') THEN RAISE EXCEPTION 'task completion changed %',kind; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3620-0000-0000-000000000001',true);
  IF kind='poll_text' THEN PERFORM public.poll_text_submit_batch(game,key,'owner-import-362',items);
  ELSE PERFORM public.poll_points_vote_batch(game,key,'owner-import-362',items); END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  IF EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id=game) THEN RAISE EXCEPTION 'task or owner consumed anonymous rate'; END IF;
  RAISE NOTICE 'Anonymous362 % task completion and actual owner batch retain their separate contract',kind;
  -- Large forms used to be split into partial batches; now they commit once.
  INSERT INTO public.questions(game_id,ord,text) SELECT game,n,'Large question '||n FROM generate_series(11,40) n;
  IF kind='poll_points' THEN
   INSERT INTO public.answers(question_id,ord,text,fixed_points) SELECT q.id,n,'Large answer '||n,10 FROM public.questions q CROSS JOIN generate_series(1,3) n WHERE q.game_id=game AND q.ord>10;
  END IF;
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3620-0000-0000-000000000001',true);
  PERFORM public.poll_abort(game);
  SELECT share_key_poll INTO key FROM public.games WHERE id=game;
  PERFORM public.poll_open(game,key);
  SELECT share_key_poll INTO key FROM public.games WHERE id=game;
  PERFORM set_config('request.jwt.claim.sub','',true);
  SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'answer_raw',' Cat ','answer_norm','forged','answer_id',a.id) ORDER BY q.ord)
   INTO items FROM public.questions q LEFT JOIN public.answers a ON a.question_id=q.id AND a.ord=1 WHERE q.game_id=game;
  response:=public.poll_anonymous_submit_prototype(game,key,browser,gen_random_uuid(),items);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'large % form rejected %',kind,response; END IF;
  SELECT count(*) INTO after_rows FROM (SELECT id FROM public.poll_text_entries WHERE game_id=game UNION ALL SELECT id FROM public.poll_votes WHERE game_id=game) votes;
  IF after_rows<>40 THEN RAISE EXCEPTION 'large form partial: %',after_rows; END IF;
  IF kind='poll_text' AND EXISTS(SELECT 1 FROM public.poll_text_entries WHERE game_id=game AND (answer_raw<>'Cat' OR answer_norm<>'cat')) THEN RAISE EXCEPTION 'text normalization trusted caller'; END IF;
  RAISE NOTICE 'Anonymous362 % complete forty-question form and server normalization passed',kind;
 END LOOP;
 IF has_table_privilege('anon','public.poll_anonymous_limits_prototype','SELECT') OR has_table_privilege('authenticated','public.poll_anonymous_limits_prototype','UPDATE') THEN RAISE EXCEPTION 'private clocks exposed'; END IF;
 DELETE FROM auth.users WHERE id='aaaaaaaa-3620-0000-0000-000000000001';
 IF EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id IN('cccccccc-3620-0000-0000-000000000001','cccccccc-3620-0000-0000-000000000002')) THEN RAISE EXCEPTION 'account deletion left clocks'; END IF;
END $$;
ROLLBACK;
