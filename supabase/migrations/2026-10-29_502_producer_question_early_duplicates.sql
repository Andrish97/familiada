-- Wczesne odsiewanie powtórzeń w zbieraniu pytań: usługa sprawdza propozycje, zanim
-- wyda na nie wyszukiwanie stron i kontrolę jakości AI. Jedna reguła powtórzenia dla
-- odsiewania i zapisu (qf_offer) — progi bez zmian względem migracji 498.
BEGIN;

CREATE FUNCTION public.qf_is_known(p_lang text,p_norm text,p_fp text,p_ak text,p_av public.vector(384)) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM producer_question_pool q WHERE q.lang=p_lang AND (q.fingerprint=p_fp OR q.answer_key=p_ak OR similarity(market_normalize_content(q.text),p_norm)>=0.88 OR 1-(q.embedding<=>p_av)>=0.94))
  OR EXISTS(SELECT 1 FROM producer_question_history h WHERE h.lang=p_lang AND (h.fingerprint=p_fp OR h.answer_key=p_ak OR similarity(h.question_norm,p_norm)>=0.88 OR 1-(h.embedding<=>p_av)>=0.94))
  OR EXISTS(SELECT 1 FROM market_game_questions q JOIN market_games g ON g.id=q.game_id WHERE g.lang=p_lang AND g.origin='producer' AND
   (q.question_norm=p_norm OR similarity(q.question_norm,p_norm)>=0.88 OR (q.embedding IS NOT NULL AND 1-(q.embedding<=>p_av)>=0.94)))
$$;

-- p_questions: [{text, answers:[{text}], embedding:[384]}]. Zwraca {known:[indeksy od 0]}.
-- Wpisy bez poprawnego tekstu/odpowiedzi/wektora nie są oznaczane — odpadną przy walidacji.
CREATE FUNCTION public.qf_known_questions(p_lang text,p_questions jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q jsonb; i bigint; norm text; ak text; known jsonb:='[]';
BEGIN
 IF p_lang NOT IN ('pl','en','uk') OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions)>50 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 FOR q,i IN SELECT value,ordinality-1 FROM jsonb_array_elements(p_questions) WITH ORDINALITY LOOP
  norm:=public.market_normalize_content(q->>'text');
  CONTINUE WHEN length(coalesce(norm,''))<8 OR jsonb_typeof(q->'answers') IS DISTINCT FROM 'array'
   OR jsonb_typeof(q->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'embedding')<>384;
  SELECT encode(sha256(convert_to(jsonb_agg(market_normalize_content(value->>'text') ORDER BY market_normalize_content(value->>'text'))::text,'UTF8')),'hex') INTO ak FROM jsonb_array_elements(q->'answers');
  IF qf_is_known(p_lang,norm,encode(sha256(convert_to(norm,'UTF8')),'hex'),ak,(q->'embedding')::text::public.vector(384)) THEN known:=known||to_jsonb(i); END IF;
 END LOOP;
 RETURN jsonb_build_object('known',known);
END $$;

CREATE OR REPLACE FUNCTION public.qf_offer(p_job uuid,p_lease uuid,p_question jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job producer_question_jobs; norm text; fp text; ak text; av public.vector(384); a jsonb; n integer; qid uuid;
BEGIN
 SELECT * INTO job FROM producer_question_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR job.status<>'running' OR job.lease IS DISTINCT FROM p_lease OR job.accepted>=job.target THEN RETURN jsonb_build_object('ok',false,'reason','stopped'); END IF;
 IF p_question->>'lang' IS DISTINCT FROM job.lang OR p_question->>'origin' IS DISTINCT FROM job.kind THEN RAISE EXCEPTION 'invalid_question_context'; END IF;
 norm:=public.market_normalize_content(p_question->>'text');
 IF length(norm)<8 OR length(norm)>500 OR jsonb_typeof(p_question->'answers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_question'; END IF;
 n:=jsonb_array_length(p_question->'answers');
 IF n<3 OR n>6 THEN RAISE EXCEPTION 'invalid_answers'; END IF;
 FOR a IN SELECT * FROM jsonb_array_elements(p_question->'answers') LOOP
  IF length(btrim(coalesce(a->>'text','')))<1 OR length(a->>'text')>120 OR jsonb_typeof(a->'fixed_points') IS DISTINCT FROM 'number' OR
   (a->>'fixed_points')::numeric<>trunc((a->>'fixed_points')::numeric) OR (a->>'fixed_points')::integer NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_answer'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT market_normalize_content(value->>'text')) FROM jsonb_array_elements(p_question->'answers'))<>n THEN RAISE EXCEPTION 'duplicate_answers'; END IF;
 IF (SELECT sum((value->>'fixed_points')::integer) FROM jsonb_array_elements(p_question->'answers'))>100 THEN RAISE EXCEPTION 'invalid_points'; END IF;
 IF jsonb_typeof(p_question->'source') IS DISTINCT FROM 'object' OR
  (job.kind='search' AND (coalesce(p_question->'source'->>'url','') !~ '^https?://' OR length(coalesce(p_question->'source'->>'evidence',''))<8)) OR
  (job.kind='generated' AND p_question->'source'->>'points_origin' IS DISTINCT FROM 'estimated') THEN RAISE EXCEPTION 'missing_provenance'; END IF;
 fp:=encode(sha256(convert_to(norm,'UTF8')),'hex');
 SELECT encode(sha256(convert_to(jsonb_agg(market_normalize_content(value->>'text') ORDER BY market_normalize_content(value->>'text'))::text,'UTF8')),'hex') INTO ak FROM jsonb_array_elements(p_question->'answers');
 av:=(p_question->'embedding')::text::public.vector(384);
 IF vector_norm(av)<0.5 THEN RAISE EXCEPTION 'invalid_embedding'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('qf:'||job.lang,0));
 IF qf_is_known(job.lang,norm,fp,ak,av) THEN RETURN jsonb_build_object('ok',false,'reason','duplicate'); END IF;
 INSERT INTO producer_question_pool(lang,text,answers,category_hint,origin,source,fingerprint,answer_key,embedding,job_id)
 VALUES(job.lang,p_question->>'text',p_question->'answers',left(coalesce(p_question->>'category_hint',''),300),job.kind,p_question->'source',fp,ak,av,job.id) RETURNING id INTO qid;
 UPDATE producer_question_jobs SET accepted=accepted+1,status=CASE WHEN accepted+1>=target THEN 'completed' ELSE status END,updated_at=now() WHERE id=job.id;
 RETURN jsonb_build_object('ok',true,'id',qid);
END $$;

REVOKE ALL ON FUNCTION public.qf_is_known(text,text,text,text,public.vector) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.qf_known_questions(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.qf_offer(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qf_is_known(text,text,text,text,public.vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.qf_known_questions(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.qf_offer(uuid,uuid,jsonb) TO service_role;
COMMIT;
