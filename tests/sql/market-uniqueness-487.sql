-- Uruchom po 487 na lokalnej bazie testowej. Wszystkie dane są syntetyczne.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE TEMP TABLE base AS SELECT jsonb_build_object('questions',jsonb_agg(jsonb_build_object(
 'text','Pytanie testowe '||n||'?', 'answers',jsonb_build_array(jsonb_build_object('text','Odpowiedź alfa','fixed_points',60),jsonb_build_object('text','Odpowiedź beta','fixed_points',40))) ORDER BY n)) payload FROM generate_series(1,10) n;
SELECT pg_temp.assert_ok(public.market_normalize_content('  ＫＯＴ   śpi ? ')='kot śpi','Unicode, case, spaces and punctuation');
SELECT pg_temp.assert_ok(public.market_normalize_content(U&'ko\200Bt')='kot','invisible characters do not bypass normalization');
SELECT pg_temp.assert_ok(public.market_normalize_content('C++')<>public.market_normalize_content('C'),'preserve meaningful symbols');
SELECT pg_temp.assert_ok(public.market_normalize_content('kąt')<>public.market_normalize_content('kat'),'preserve diacritics');
SELECT pg_temp.assert_ok(public.market_content_key(payload)=public.market_content_key(jsonb_set(payload,'{questions,0,answers,0,fixed_points}','1'::jsonb)),'points do not create a new game') FROM base;
SELECT pg_temp.assert_ok(public.market_content_key(payload)=public.market_content_key(jsonb_build_object('questions',(SELECT jsonb_agg(q ORDER BY ord DESC) FROM jsonb_array_elements(payload->'questions') WITH ORDINALITY t(q,ord)))),'question order ignored') FROM base;
SELECT pg_temp.assert_ok(public.market_content_key(payload)=public.market_content_key(jsonb_set(payload,'{questions,0,answers}',(SELECT jsonb_agg(a ORDER BY ord DESC) FROM jsonb_array_elements(payload#>'{questions,0,answers}') WITH ORDINALITY t(a,ord)))),'answer order ignored') FROM base;
SELECT pg_temp.assert_ok(public.market_content_key(payload)<>public.market_content_key(jsonb_set(payload,'{questions,0,answers,0,text}','"Inna odpowiedź"'::jsonb)),'different answers distinguish exact content') FROM base;
SELECT pg_temp.assert_ok(public.market_content_key('{"questions":[{"text":"A B"},{"text":"C"}]}')<>public.market_content_key('{"questions":[{"text":"A"},{"text":"B C"}]}'),'question boundaries retained');
SELECT pg_temp.assert_ok(public.market_content_key('{"questions":[]}') IS NULL,'empty payload has no reserved key');
INSERT INTO public.market_games(id,title,lang,status,payload) SELECT '11111111-1111-4111-8111-111111111111','Oryginał','pl','published',payload FROM base;
INSERT INTO public.market_games(id,title,lang,status,payload) SELECT '22222222-2222-4222-8222-222222222222','Zmieniony tytuł','uk','pending',payload FROM base;
SELECT pg_temp.assert_ok((SELECT count(*)=20 FROM public.market_game_questions WHERE game_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')),'projection creates 20 questions');
SELECT pg_temp.assert_ok((public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'matches'->0->>'exact_content')::boolean,'renamed exact duplicate in another language found');
SELECT pg_temp.assert_ok(jsonb_array_length(public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'matches')=1,'self excluded');
UPDATE public.market_games SET status='withdrawn' WHERE id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.assert_ok(jsonb_array_length(public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'matches')=0,'withdrawal excludes candidate');
UPDATE public.market_games SET status='published',lang='pl',payload=jsonb_set(payload,'{questions,0,answers,0,text}','"Nowa odpowiedź"'::jsonb) WHERE id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.assert_ok((public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'matches'->0->>'matched_questions')::integer=10,'same questions with changed answers remain a review candidate');
SELECT pg_temp.assert_ok(NOT (public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'matches'->0->>'exact_content')::boolean,'changed answer not marked exact');
SELECT pg_temp.assert_ok(public.market_uniqueness_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'error'='not_found','unknown id');
SELECT pg_temp.assert_ok(public.market_uniqueness_report(NULL,'{}'::jsonb)->>'error'='invalid_payload','invalid input is explicit');
SELECT pg_temp.assert_ok(NOT has_function_privilege('anon','public.market_uniqueness_report(uuid,jsonb,text,jsonb,text)','EXECUTE'),'anon cannot read moderator report');
SELECT pg_temp.assert_ok(NOT has_function_privilege('authenticated','public.market_uniqueness_report(uuid,jsonb,text,jsonb,text)','EXECUTE'),'users cannot read pending matches');
SELECT pg_temp.assert_ok(NOT has_table_privilege('anon','public.market_game_questions','SELECT'),'projection private');
-- Wektory są kontrolowanymi danymi jednostkowymi, nie testem jakości modelu.
CREATE TEMP TABLE vector_batch AS SELECT jsonb_agg(jsonb_build_object('question_pos',pos,'embedding',
 (SELECT jsonb_agg(CASE WHEN dim=pos THEN 1 ELSE 0 END ORDER BY dim) FROM generate_series(1,384) dim)) ORDER BY pos) vectors
 FROM generate_series(1,10) pos;
SELECT pg_temp.assert_ok((public.market_store_question_embeddings(g.id,public.market_content_revision(g.payload),'paraphrase-multilingual-minilm-l12-v2-qa-v1',b.vectors)->>'ok')::boolean,'store complete batch')
 FROM public.market_games g CROSS JOIN vector_batch b WHERE g.id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
SELECT pg_temp.assert_ok((public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'semantic'->>'complete')::boolean,'complete source and corpus');
SELECT pg_temp.assert_ok((public.market_store_question_embeddings('11111111-1111-4111-8111-111111111111','outdated','paraphrase-multilingual-minilm-l12-v2-qa-v1',vectors)->>'error')='stale_revision','stale model result rejected') FROM vector_batch;
UPDATE public.market_games SET payload=jsonb_set(payload,'{questions,0,answers,0,fixed_points}','7'::jsonb) WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_ok((SELECT count(*)=10 FROM public.market_game_questions WHERE game_id='11111111-1111-4111-8111-111111111111' AND embedding IS NOT NULL),'points preserve question embeddings');
UPDATE public.market_game_questions SET embedding_model='different-model' WHERE game_id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.assert_ok(NOT (public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'semantic'->>'complete')::boolean,'different model is incomplete');
SELECT pg_temp.assert_ok((public.market_uniqueness_report('11111111-1111-4111-8111-111111111111')->'matches'->0->>'matched_questions')::integer=10,'missing semantic coverage does not disable text');
UPDATE public.market_games SET payload=jsonb_set(payload,'{questions,0,text}','"Zmienione pytanie"'::jsonb) WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.market_game_questions WHERE game_id='11111111-1111-4111-8111-111111111111' AND embedding IS NULL AND question_pos=1),'content edit invalidates changed question');
UPDATE public.market_games SET payload=jsonb_set(payload,'{questions,1,answers,0,text}','"Odpowiedź zmieniona"'::jsonb) WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_ok((SELECT embedding IS NULL FROM public.market_game_questions WHERE game_id='11111111-1111-4111-8111-111111111111' AND question_pos=2),'answer edit invalidates question context');
SELECT pg_temp.assert_ok(NOT has_function_privilege('authenticated','public.market_store_question_embeddings(uuid,text,text,jsonb)','EXECUTE'),'users cannot inject vectors');
DELETE FROM public.market_games WHERE id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM public.market_game_questions WHERE game_id='22222222-2222-4222-8222-222222222222'),'delete cascades');
ROLLBACK;
