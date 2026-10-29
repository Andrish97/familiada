\set ON_ERROR_STOP 1
BEGIN;
DO $$
DECLARE request uuid:=gen_random_uuid(); vec jsonb; answers jsonb; src jsonb; ids jsonb; created jsonb; game uuid; published uuid; legacy uuid; result jsonb; n integer;
BEGIN
 IF has_function_privilege('authenticated','qf_delete(uuid,text)','EXECUTE') OR has_function_privilege('anon','qf_delete(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'delete_exposed'; END IF;
 vec:=to_jsonb(ARRAY[1.0]||array_fill(0.0::numeric,ARRAY[383]));
 answers:=jsonb_build_array(jsonb_build_object('text','Nóż','fixed_points',40),jsonb_build_object('text','Wodę','fixed_points',30),jsonb_build_object('text','Jedzenie','fixed_points',22));
 src:=jsonb_build_object('points_origin','estimated');
 FOR n IN 1..10 LOOP
  INSERT INTO producer_question_pool(lang,text,answers,origin,source,fingerprint,answer_key,embedding)
  VALUES('en','Unique prompt '||gen_random_uuid(),answers,'generated',src,gen_random_uuid()::text,gen_random_uuid()::text,vec::text::vector(384));
 END LOOP;
 SELECT jsonb_agg(id ORDER BY id) INTO ids FROM producer_question_pool WHERE lang='en';
 created:=qf_games_commit(request,'en','auto','',ids,'[{"title":"One","description":"First game description."}]',10);
 game:=(created->0->>'id')::uuid;
 -- Gra nigdy nieopublikowana: usuwalna; historia pytań zostaje.
 IF (qf_delete(game,'pl'))->>'reason'<>'not_found' THEN RAISE EXCEPTION 'wrong_language_deleted'; END IF;
 result:=qf_delete(game,'en');
 IF result->>'ok'<>'true' OR EXISTS(SELECT 1 FROM producer_question_games WHERE id=game) THEN RAISE EXCEPTION 'draft_not_deleted'; END IF;
 IF (SELECT count(*) FROM producer_question_history WHERE lang='en')<>10 THEN RAISE EXCEPTION 'history_lost'; END IF;
 IF (qf_delete(game,'en'))->>'reason'<>'not_found' THEN RAISE EXCEPTION 'double_delete'; END IF;
 -- Gra opublikowana: odmowa; po wycofaniu usunięta razem z wierszem Społeczności.
 FOR n IN 1..10 LOOP
  INSERT INTO producer_question_pool(lang,text,answers,origin,source,fingerprint,answer_key,embedding)
  VALUES('en','Second prompt '||gen_random_uuid(),answers,'generated',src,gen_random_uuid()::text,gen_random_uuid()::text,vec::text::vector(384));
 END LOOP;
 SELECT jsonb_agg(id ORDER BY id) INTO ids FROM producer_question_pool WHERE lang='en';
 created:=qf_games_commit(gen_random_uuid(),'en','auto','',ids,'[{"title":"Two","description":"Second game description."}]',10);
 game:=(created->0->>'id')::uuid;
 published:=(qf_publish(game)->>'id')::uuid;
 IF (qf_delete(game,'en'))->>'reason'<>'published' THEN RAISE EXCEPTION 'published_deleted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM market_games WHERE id=published) THEN RAISE EXCEPTION 'published_row_lost'; END IF;
 PERFORM qf_unpublish(game);
 IF (qf_delete(game,'en'))->>'ok'<>'true' THEN RAISE EXCEPTION 'withdrawn_not_deleted'; END IF;
 IF EXISTS(SELECT 1 FROM market_games WHERE id=published) OR EXISTS(SELECT 1 FROM producer_question_games WHERE id=game) THEN RAISE EXCEPTION 'withdrawn_rows_left'; END IF;
 -- Dawna gra Producenta (tylko market_games): usuwalna po wycofaniu, pytania z wektorem trafiają do historii.
 INSERT INTO market_games(title,description,lang,payload,origin,status) VALUES('Legacy','Old producer game','uk',
  jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('text','Що береш на пляж?','answers',answers),jsonb_build_object('text','Що їси на сніданок?','answers',answers))),'producer','published') RETURNING id INTO legacy;
 IF (SELECT count(*) FROM market_game_questions WHERE game_id=legacy)<>2 THEN RAISE EXCEPTION 'legacy_questions_not_indexed'; END IF;
 UPDATE market_game_questions SET embedding=vec::text::vector(384),embedding_model='test',embedding_question_key='k',embedded_at=now() WHERE game_id=legacy AND question_pos=1;
 IF (qf_delete(legacy,'uk'))->>'reason'<>'published' THEN RAISE EXCEPTION 'legacy_published_deleted'; END IF;
 UPDATE market_games SET status='withdrawn' WHERE id=legacy;
 result:=qf_delete(legacy,'uk');
 IF result->>'ok'<>'true' OR (result->>'history_added')::integer<>1 THEN RAISE EXCEPTION 'legacy_not_deleted: %',result; END IF;
 IF EXISTS(SELECT 1 FROM market_games WHERE id=legacy) THEN RAISE EXCEPTION 'legacy_row_left'; END IF;
 IF (SELECT count(*) FROM producer_question_history WHERE lang='uk' AND game_id=legacy)<>1 THEN RAISE EXCEPTION 'legacy_history_missing'; END IF;
 IF (SELECT question_norm FROM producer_question_history WHERE lang='uk' AND game_id=legacy)<>market_normalize_content('Що береш на пляж?') THEN RAISE EXCEPTION 'legacy_history_norm'; END IF;
 -- Gra Społeczności (nie Producenta) nie jest widoczna dla tej funkcji.
 INSERT INTO market_games(title,description,lang,payload,origin,status) VALUES('Community','x','uk',jsonb_build_object('questions','[]'::jsonb),'community','withdrawn') RETURNING id INTO legacy;
 IF (qf_delete(legacy,'uk'))->>'reason'<>'not_found' THEN RAISE EXCEPTION 'community_deleted'; END IF;
END $$;
ROLLBACK;
\echo 'question-bank-delete-500: OK'
