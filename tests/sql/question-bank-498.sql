\set ON_ERROR_STOP 1
BEGIN;
DO $$
DECLARE request uuid:=gen_random_uuid(); job jsonb; claim jsonb; offered jsonb; q jsonb; vec jsonb;
 ids jsonb; metadata jsonb; created jsonb; again jsonb; n integer; original integer;
BEGIN
 IF has_table_privilege('anon','producer_question_pool','SELECT') OR has_function_privilege('authenticated','qf_job_claim()','EXECUTE') THEN RAISE EXCEPTION 'private_bank_exposed'; END IF;
 job:=qf_job_create(request,'pl','generated',50,'test',false);
 IF qf_job_create(request,'pl','generated',50,'test',false)->>'id'<>job->>'id' THEN RAISE EXCEPTION 'non_idempotent_job'; END IF;
 claim:=qf_job_claim();
 vec:=to_jsonb(ARRAY[1.0]||array_fill(0.0::numeric,ARRAY[383]));
 q:=jsonb_build_object('lang','pl','origin','generated','text','Co zabierasz na bezludną wyspę?',
  'answers',jsonb_build_array(jsonb_build_object('text','Nóż','fixed_points',40),jsonb_build_object('text','Wodę','fixed_points',30),jsonb_build_object('text','Jedzenie','fixed_points',22)),
  'source',jsonb_build_object('points_origin','estimated'),'embedding',vec);
 offered:=qf_offer((job->>'id')::uuid,(claim->>'lease')::uuid,q);
 IF offered->>'ok'<>'true' THEN RAISE EXCEPTION 'offer_failed'; END IF;
 IF qf_offer((job->>'id')::uuid,(claim->>'lease')::uuid,q)->>'reason'<>'duplicate' THEN RAISE EXCEPTION 'duplicate_accepted'; END IF;
 IF (SELECT accepted FROM producer_question_jobs WHERE id=(job->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'incorrect_progress'; END IF;
 PERFORM qf_job_control((job->>'id')::uuid,'pause');
 IF qf_offer((job->>'id')::uuid,(claim->>'lease')::uuid,q)->>'reason'<>'stopped' THEN RAISE EXCEPTION 'pause_did_not_stop'; END IF;
 PERFORM qf_job_control((job->>'id')::uuid,'resume');
 FOR n IN 1..20 LOOP
  INSERT INTO producer_question_pool(lang,text,answers,origin,source,fingerprint,answer_key,embedding)
  VALUES('en','Unique prompt '||gen_random_uuid(),q->'answers','generated',q->'source',gen_random_uuid()::text,gen_random_uuid()::text,vec::text::vector(384));
 END LOOP;
 SELECT jsonb_agg(id ORDER BY id) INTO ids FROM producer_question_pool WHERE lang='en';
 metadata:='[{"title":"One","description":"First game description."},{"title":"Two","description":"Second game description."}]';
 BEGIN
  PERFORM qf_games_commit(gen_random_uuid(),'en','auto','',ids,metadata,11);
  RAISE EXCEPTION 'short_batch_accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_game_batch' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM producer_question_pool WHERE lang='en')<>20 THEN RAISE EXCEPTION 'failed_batch_consumed_pool'; END IF;
 request:=gen_random_uuid();
 created:=qf_games_commit(request,'en','auto','',ids,metadata,10);
 IF jsonb_array_length(created)<>2 OR EXISTS(SELECT 1 FROM producer_question_pool WHERE lang='en') THEN RAISE EXCEPTION 'batch_not_atomic'; END IF;
 IF (SELECT count(*) FROM producer_question_history WHERE lang='en')<>20 THEN RAISE EXCEPTION 'missing_used_history'; END IF;
 IF (created->0->'payload'->'questions'->0->'answers'->2->>'fixed_points')::integer<>22 THEN RAISE EXCEPTION 'source_points_changed'; END IF;
 again:=qf_games_commit(request,'en','auto','',ids,metadata,10);
 IF created<>again THEN RAISE EXCEPTION 'batch_retry_duplicated'; END IF;
 offered:=qf_publish((created->0->>'id')::uuid);
 IF (SELECT status FROM market_games WHERE id=(offered->>'id')::uuid)<>'published' THEN RAISE EXCEPTION 'publish_failed'; END IF;
 PERFORM qf_unpublish((created->0->>'id')::uuid);
 IF (SELECT status FROM market_games WHERE id=(offered->>'id')::uuid)<>'withdrawn' THEN RAISE EXCEPTION 'unpublish_failed'; END IF;
 PERFORM qf_publish((created->0->>'id')::uuid);
 IF (SELECT status FROM market_games WHERE id=(offered->>'id')::uuid)<>'published' THEN RAISE EXCEPTION 'republish_failed'; END IF;
 IF NOT qf_ai_reserve(gen_random_uuid(),'questions',10,10) OR qf_ai_reserve(gen_random_uuid(),'questions',1,10) THEN RAISE EXCEPTION 'budget_exceeded'; END IF;
 IF NOT qf_ai_reserve(gen_random_uuid(),'marketing',10,10) THEN RAISE EXCEPTION 'budgets_not_separate'; END IF;
END $$;
ROLLBACK;
\echo 'question-bank-498: OK'
