\set ON_ERROR_STOP 1
BEGIN;
DO $$
DECLARE job jsonb;
BEGIN
 IF has_table_privilege('anon','producer_question_logs','SELECT') OR has_table_privilege('authenticated','producer_question_logs','INSERT') THEN RAISE EXCEPTION 'logs_exposed'; END IF;
 job:=qf_job_create(gen_random_uuid(),'pl','search',5,'',false);
 INSERT INTO producer_question_logs(lang,job_id,level,message) VALUES('pl',(job->>'id')::uuid,'info','Zlecono 5 nowych pytań.');
 BEGIN
  INSERT INTO producer_question_logs(lang,level,message) VALUES('de','info','x');
  RAISE EXCEPTION 'bad_language_accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO producer_question_logs(lang,level,message) VALUES('pl','debug','x');
  RAISE EXCEPTION 'bad_level_accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 DELETE FROM producer_question_jobs WHERE id=(job->>'id')::uuid;
 IF (SELECT job_id FROM producer_question_logs WHERE lang='pl') IS NOT NULL THEN RAISE EXCEPTION 'log_kept_job_reference'; END IF;
END $$;
ROLLBACK;
\echo 'question-bank-logs-501: OK'
BEGIN;
DO $$
DECLARE vec jsonb; answers jsonb; src jsonb; ids jsonb; created jsonb; game uuid; published uuid; legacy uuid; result jsonb; qs jsonb; n integer;
BEGIN
 IF has_function_privilege('authenticated','qf_disassemble(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'disassemble_exposed'; END IF;
 vec:=to_jsonb(ARRAY[1.0]||array_fill(0.0::numeric,ARRAY[383]));
 FOR n IN 1..10 LOOP
  answers:=jsonb_build_array(jsonb_build_object('text','Nóż '||n,'fixed_points',40),jsonb_build_object('text','Wodę '||n,'fixed_points',30),jsonb_build_object('text','Jedzenie '||n,'fixed_points',22));
  INSERT INTO producer_question_pool(lang,text,answers,origin,source,fingerprint,answer_key,embedding)
  VALUES('pl','Pytanie numer '||n||' o wyspę?',answers,'generated',jsonb_build_object('points_origin','estimated'),encode(sha256(convert_to(market_normalize_content('Pytanie numer '||n||' o wyspę?'),'UTF8')),'hex'),'ak'||n,vec::text::vector(384));
 END LOOP;
 SELECT jsonb_agg(id ORDER BY created_at,id) INTO ids FROM producer_question_pool WHERE lang='pl';
 created:=qf_games_commit(gen_random_uuid(),'pl','auto','',ids,'[{"title":"Wyspa","description":"Opis gry."}]',10);
 game:=(created->0->>'id')::uuid;
 IF EXISTS(SELECT 1 FROM producer_question_pool WHERE lang='pl') THEN RAISE EXCEPTION 'pool_not_consumed'; END IF;
 SELECT jsonb_agg(q||jsonb_build_object('embedding',vec)) INTO qs FROM jsonb_array_elements(created->0->'payload'->'questions') q;
 -- Opublikowana: odmowa i brak zmian.
 published:=(qf_publish(game)->>'id')::uuid;
 IF qf_disassemble(game,'pl',qs)->>'reason'<>'published' THEN RAISE EXCEPTION 'published_disassembled'; END IF;
 IF (SELECT count(*) FROM producer_question_history WHERE game_id=game)<>10 THEN RAISE EXCEPTION 'published_history_lost'; END IF;
 PERFORM qf_unpublish(game);
 -- Zły język: brak gry.
 IF qf_disassemble(game,'en',qs)->>'reason'<>'not_found' THEN RAISE EXCEPTION 'wrong_language'; END IF;
 -- Jedno pytanie zepsute (2 odpowiedzi): pominięte, pozostałe wracają do puli.
 qs:=jsonb_set(qs,'{0,answers}',jsonb_build_array(jsonb_build_object('text','A','fixed_points',50),jsonb_build_object('text','B','fixed_points',40)));
 result:=qf_disassemble(game,'pl',qs);
 IF (result->>'restored')::int<>9 OR (result->>'skipped')::int<>1 THEN RAISE EXCEPTION 'restore_counts %',result; END IF;
 IF EXISTS(SELECT 1 FROM producer_question_games WHERE id=game) OR EXISTS(SELECT 1 FROM market_games WHERE id=published) THEN RAISE EXCEPTION 'game_left'; END IF;
 IF EXISTS(SELECT 1 FROM producer_question_history WHERE game_id=game) THEN RAISE EXCEPTION 'history_left'; END IF;
 IF (SELECT count(*) FROM producer_question_pool WHERE lang='pl' AND source->>'from_game'='Wyspa')<>9 THEN RAISE EXCEPTION 'pool_not_restored'; END IF;
 -- Ponowne rozłożenie tej samej (już nieistniejącej) gry: nic się nie dzieje.
 IF qf_disassemble(game,'pl',qs)->>'reason'<>'not_found' THEN RAISE EXCEPTION 'double_disassemble'; END IF;
 -- Dawna gra Producenta (tylko market_games), wycofana; pytanie obecne już w puli to powtórzenie.
 INSERT INTO market_games(title,description,lang,payload,origin,status) VALUES('Stara','x','pl',
  jsonb_build_object('questions',jsonb_build_array((qs->1)-'embedding',jsonb_build_object('text','Co jesz na śniadanie rano?','answers',jsonb_build_array(jsonb_build_object('text','Jajka','fixed_points',40),jsonb_build_object('text','Owsianka','fixed_points',30),jsonb_build_object('text','Kanapki','fixed_points',20))))),'producer','withdrawn') RETURNING id INTO legacy;
 result:=qf_disassemble(legacy,'pl',jsonb_build_array(qs->1,jsonb_build_object('text','Co jesz na śniadanie rano?','answers',jsonb_build_array(jsonb_build_object('text','Jajka','fixed_points',40),jsonb_build_object('text','Owsianka','fixed_points',30),jsonb_build_object('text','Kanapki','fixed_points',20)),'embedding',vec)));
 IF (result->>'restored')::int<>1 OR (result->>'duplicates')::int<>1 THEN RAISE EXCEPTION 'legacy_counts %',result; END IF;
 IF EXISTS(SELECT 1 FROM market_games WHERE id=legacy) THEN RAISE EXCEPTION 'legacy_left'; END IF;
 IF (SELECT origin FROM producer_question_pool WHERE text='Co jesz na śniadanie rano?')<>'generated' THEN RAISE EXCEPTION 'legacy_origin'; END IF;
END $$;
ROLLBACK;
\echo 'question-bank-disassemble-501: OK'
