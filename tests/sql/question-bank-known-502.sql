\set ON_ERROR_STOP 1
BEGIN;
DO $$
DECLARE vec jsonb; other jsonb; answers jsonb; job jsonb; claim jsonb; q jsonb; result jsonb;
BEGIN
 IF has_function_privilege('authenticated','qf_known_questions(text,jsonb)','EXECUTE') OR has_function_privilege('anon','qf_is_known(text,text,text,text,vector)','EXECUTE') THEN RAISE EXCEPTION 'known_exposed'; END IF;
 vec:=to_jsonb(ARRAY[1.0]||array_fill(0.0::numeric,ARRAY[383]));
 other:=to_jsonb(ARRAY[0.0,1.0]||array_fill(0.0::numeric,ARRAY[382]));
 answers:=jsonb_build_array(jsonb_build_object('text','Nóż','fixed_points',40),jsonb_build_object('text','Wodę','fixed_points',30),jsonb_build_object('text','Jedzenie','fixed_points',22));
 job:=qf_job_create(gen_random_uuid(),'pl','generated',5,'',false);
 claim:=qf_job_claim();
 q:=jsonb_build_object('lang','pl','origin','generated','text','Co zabierasz na bezludną wyspę?','answers',answers,'source',jsonb_build_object('points_origin','estimated'),'embedding',vec);
 IF qf_offer((job->>'id')::uuid,(claim->>'lease')::uuid,q)->>'ok'<>'true' THEN RAISE EXCEPTION 'offer_failed'; END IF;
 -- Ten sam tekst (inne wielkie litery), parafraza o tym samym wektorze, nowe pytanie, wpis bez wektora.
 result:=qf_known_questions('pl',jsonb_build_array(
  jsonb_build_object('text','CO ZABIERASZ NA BEZLUDNĄ WYSPĘ','answers',jsonb_build_array(jsonb_build_object('text','A')),'embedding',other),
  jsonb_build_object('text','Jaką rzecz bierzesz na wyspę bez ludzi?','answers',jsonb_build_array(jsonb_build_object('text','B')),'embedding',vec),
  jsonb_build_object('text','Co jesz na śniadanie w niedzielę?','answers',jsonb_build_array(jsonb_build_object('text','Jajka')),'embedding',other),
  jsonb_build_object('text','Pytanie bez wektora do sprawdzenia','answers','[]'::jsonb)));
 IF result->'known'<>'[0,1]'::jsonb THEN RAISE EXCEPTION 'known_wrong %',result; END IF;
 IF (qf_known_questions('en',jsonb_build_array(q-'lang'))->'known')<>'[]'::jsonb THEN RAISE EXCEPTION 'language_leak'; END IF;
 -- qf_offer nadal odrzuca powtórzenie tą samą regułą.
 IF qf_offer((job->>'id')::uuid,(claim->>'lease')::uuid,q||jsonb_build_object('embedding',other))->>'reason'<>'duplicate' THEN RAISE EXCEPTION 'offer_duplicate_accepted'; END IF;
 BEGIN
  PERFORM qf_known_questions('pl',(SELECT jsonb_agg(q) FROM generate_series(1,51)));
  RAISE EXCEPTION 'batch_limit_missing';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_request' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
\echo 'question-bank-known-502: OK'
