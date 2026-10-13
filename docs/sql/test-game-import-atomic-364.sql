BEGIN;
-- Disposable identities, resources, triggers and checks all roll back.
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3640-1000-0000-000000000001','import364@example.invalid',false,now(),'{"username":"import364"}'),
 ('aaaaaaaa-3640-1000-0000-000000000002','other364@example.invalid',false,now(),'{"username":"other364"}'),
 ('aaaaaaaa-3640-1000-0000-000000000003',NULL,true,NULL,'{}');

CREATE FUNCTION pg_temp.fail_import_answer364() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.text='FAIL-IMPORT364' THEN RAISE EXCEPTION 'fixture_import_failure364'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_import_failure364 BEFORE INSERT ON public.answers FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_import_answer364();

DO $$
DECLARE owner364 uuid:='aaaaaaaa-3640-1000-0000-000000000001'; other364 uuid:='aaaaaaaa-3640-1000-0000-000000000002';
 request364 uuid; gid uuid; result jsonb; replay jsonb; packet jsonb; typ text; before364 bigint; canonical jsonb; editor jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner364::text,true);
 FOREACH typ IN ARRAY ARRAY['prepared','poll_text','poll_points'] LOOP
  request364:=gen_random_uuid();
  packet:=jsonb_build_object('game',jsonb_build_object('name','Import364 '||typ,'type',typ,'id',other364,'owner_id',other364,'settings','{"foreign":"secret"}'::jsonb),
   'questions','[{"id":"foreign-q","text":"Co?","answers":[{"id":"foreign-a","text":"Aparat","fixed_points":25.9},{"text":"Książka","fixed_points":150},{"text":"Piłka","fixed_points":-5}]}]'::jsonb);
  result:=public.game_import_package(packet,owner364,request364);
  IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'already' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'new import failed: %',result; END IF;
  gid:=(result->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=gid AND owner_id=owner364 AND name='Import364 '||typ AND type::text=typ AND status='draft' AND settings='{}') THEN RAISE EXCEPTION 'wrong import ownership or game fields'; END IF;
  IF (SELECT count(*) FROM public.questions WHERE game_id=gid)<>1 THEN RAISE EXCEPTION 'missing questions'; END IF;
  IF typ='poll_text' THEN
   IF EXISTS(SELECT 1 FROM public.answers a JOIN public.questions q ON q.id=a.question_id WHERE q.game_id=gid) THEN RAISE EXCEPTION 'text import retained answers'; END IF;
  ELSE
   IF (SELECT array_agg(a.fixed_points ORDER BY a.ord) FROM public.answers a JOIN public.questions q ON q.id=a.question_id WHERE q.game_id=gid) IS DISTINCT FROM ARRAY[25,100,0] THEN RAISE EXCEPTION 'package answer points changed'; END IF;
  END IF;
  replay:=public.game_import_package(packet,owner364,request364,'{"game":"Other language"}');
  IF replay->>'id' IS DISTINCT FROM result->>'id' OR replay->>'already' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'retry duplicated import'; END IF;
  IF (public.game_import_package(jsonb_set(packet,'{game,name}','"Changed"'),owner364,request364)->>'error') IS DISTINCT FROM 'request_conflict' THEN RAISE EXCEPTION 'nonce accepted different payload'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other364::text,true);
  IF (public.game_import_package(packet,owner364,request364)->>'error') IS DISTINCT FROM 'auth_required' THEN RAISE EXCEPTION 'foreign account inherited import'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner364::text,true);
  -- Editor payload remains backward compatible: .points only for prepared.
  editor:=public.game_import_content(gid,'Editor364','[{"text":"Edytor","answers":[{"text":"Tak","points":42}]}]');
  IF editor->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'editor import broke'; END IF;
  IF typ<>'poll_text' AND (SELECT a.fixed_points FROM public.answers a JOIN public.questions q ON q.id=a.question_id WHERE q.game_id=gid) IS DISTINCT FROM (CASE WHEN typ='prepared' THEN 42 ELSE 0 END) THEN RAISE EXCEPTION 'editor points contract changed'; END IF;
  DELETE FROM public.games WHERE id=gid;
  IF (public.game_import_package(packet,owner364,request364)->>'error') IS DISTINCT FROM 'previously_removed' THEN RAISE EXCEPTION 'retry resurrected deleted game'; END IF;
 END LOOP;
 canonical:=public._game_package_normalize('{"game":{"name":" ","type":"foreign"},"questions":[null,{"text":" ","answers":[]}]}','{"game":"Imported","question":"Question {ord}","answer":"Answer {ord}"}');
 IF canonical#>>'{game,name}' IS DISTINCT FROM 'Imported' OR canonical#>>'{game,type}' IS DISTINCT FROM 'poll_text' OR canonical#>>'{questions,1,text}' IS DISTINCT FROM 'Question 2' THEN RAISE EXCEPTION 'localized defaults or invalid type changed'; END IF;
 canonical:=public._game_package_normalize(jsonb_build_object('game',jsonb_build_object('name',repeat('ą',90),'type','prepared'),'questions',jsonb_build_array(jsonb_build_object('text',repeat('ą',250),'answers',jsonb_build_array(
  jsonb_build_object('text',repeat('ą',30),'fixed_points','12.9'),jsonb_build_object('fixed_points','1e2'),jsonb_build_object('fixed_points','bad'),jsonb_build_object('fixed_points',true),jsonb_build_object('fixed_points',null),jsonb_build_object('fixed_points','1e999999'),jsonb_build_object('fixed_points',99))))));
 IF length(canonical#>>'{game,name}')<>80 OR length(canonical#>>'{questions,0,text}')<>200 OR length(canonical#>>'{questions,0,answers,0,text}')<>17 OR jsonb_array_length(canonical#>'{questions,0,answers}')<>6 THEN RAISE EXCEPTION 'limits changed'; END IF;
 IF (SELECT array_agg((value->>'fixed_points')::int ORDER BY ordinality) FROM jsonb_array_elements(canonical#>'{questions,0,answers}') WITH ORDINALITY) IS DISTINCT FROM ARRAY[12,100,0,1,0,0] THEN RAISE EXCEPTION 'numeric normalization changed'; END IF;
 before364:=(SELECT count(*) FROM public.games WHERE owner_id=owner364);
 FOREACH packet IN ARRAY ARRAY['null'::jsonb,'{}'::jsonb,'{"game":{},"questions":null}'::jsonb,'{"game":[],"questions":[]}'::jsonb] LOOP
  IF (public.game_import_package(packet,owner364,gen_random_uuid())->>'error') IS DISTINCT FROM 'invalid_payload' THEN RAISE EXCEPTION 'malformed packet accepted'; END IF;
 END LOOP;
 packet:=jsonb_build_object('game',jsonb_build_object('name',repeat('x',8388609)),'questions','[]'::jsonb);
 IF (public.game_import_package(packet,owner364,gen_random_uuid())->>'error') IS DISTINCT FROM 'invalid_payload' THEN RAISE EXCEPTION 'oversized packet accepted'; END IF;
 request364:=gen_random_uuid();
 BEGIN
  PERFORM public.game_import_package('{"game":{"name":"Broken364","type":"prepared"},"questions":[{"text":"A","answers":[{"text":"Good"}]},{"text":"B","answers":[{"text":"FAIL-IMPORT364"}]}]}',owner364,request364);
  RAISE EXCEPTION 'fixture unexpectedly succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'fixture_import_failure364' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.games WHERE owner_id=owner364)<>before364 OR EXISTS(SELECT 1 FROM public.game_import_receipts WHERE owner_id=owner364 AND request_id=request364) THEN RAISE EXCEPTION 'failed transaction left partial game or receipt'; END IF;
 IF (public.game_import_package('{"game":{},"questions":[]}',owner364,NULL)->>'error') IS DISTINCT FROM 'invalid_request' THEN RAISE EXCEPTION 'null request accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF (public.game_import_package('{"game":{},"questions":[]}',owner364,gen_random_uuid())->>'error') IS DISTINCT FROM 'auth_required' THEN RAISE EXCEPTION 'unauthenticated import accepted'; END IF;
 UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=owner364;
 PERFORM set_config('request.jwt.claim.sub',owner364::text,true);
 IF (public.game_import_package('{"game":{},"questions":[]}',owner364,gen_random_uuid())->>'error') IS DISTINCT FROM 'auth_required' THEN RAISE EXCEPTION 'banned account imported'; END IF;
 UPDATE auth.users SET banned_until=NULL WHERE id=owner364;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3640-1000-0000-000000000003',true);
 result:=public.game_import_package('{"game":{"name":"Guest364","type":"prepared"},"questions":[]}','aaaaaaaa-3640-1000-0000-000000000003',gen_random_uuid());
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'existing guest import disabled'; END IF;
 DELETE FROM auth.users WHERE id IN(owner364,'aaaaaaaa-3640-1000-0000-000000000003');
 IF EXISTS(SELECT 1 FROM public.game_import_receipts WHERE owner_id IN(owner364,'aaaaaaaa-3640-1000-0000-000000000003')) OR EXISTS(SELECT 1 FROM public.games WHERE id=(result->>'id')::uuid) THEN RAISE EXCEPTION 'account cascade left import data'; END IF;
 RAISE NOTICE 'Import364 all types, editor compatibility, defaults/limits, atomic rollback, idempotence, foreign/anonymous/banned auth, guest and parent cascades passed';
END $$;

DO $$
DECLARE role364 text;
BEGIN
 FOREACH role364 IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role364,'public.game_import_receipts','SELECT,INSERT,UPDATE,DELETE') OR has_function_privilege(role364,'public._game_import_package(jsonb,uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege(role364,'public._game_package_normalize(jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'private import data exposed to %',role364; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.game_import_package(jsonb,uuid,uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('authenticated','public.game_import_package(jsonb,uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public RPC grants incorrect'; END IF;
 RAISE NOTICE 'Import364 private receipt/helper ACL and authenticated RPC grants passed';
END $$;
ROLLBACK;
