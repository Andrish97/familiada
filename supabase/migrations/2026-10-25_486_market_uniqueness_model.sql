-- Publiczny model porównań. Dodająca migracja, bez włączania blokady zapisu.
BEGIN;

CREATE OR REPLACE FUNCTION public.market_normalize_content(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT btrim(regexp_replace(btrim(regexp_replace(lower(translate(normalize(coalesce(p_text,''),NFKC),U&'\00AD\200B\200C\200D\2060\FEFF\202A\202B\202C\202D\202E\2066\2067\2068\2069','')), '[[:space:]]+', ' ', 'g')), '[?!.…]+$', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.market_content_canonical(p_payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN jsonb_array_length(coalesce(p_payload->'questions','[]'::jsonb))=0 THEN NULL ELSE
 (SELECT jsonb_agg(item ORDER BY item::text COLLATE "C") FROM (
   SELECT jsonb_build_array(public.market_normalize_content(q->>'text'),
     coalesce((SELECT jsonb_agg(public.market_normalize_content(a->>'text') ORDER BY public.market_normalize_content(a->>'text') COLLATE "C")
       FROM jsonb_array_elements(coalesce(q->'answers','[]'::jsonb)) a),'[]'::jsonb)) item
   FROM jsonb_array_elements(coalesce(p_payload->'questions','[]'::jsonb)) q
 ) qs) END
$$;

CREATE OR REPLACE FUNCTION public.market_content_key(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT encode(sha256(convert_to(public.market_content_canonical(p_payload)::text,'UTF8')),'hex')
$$;

CREATE OR REPLACE FUNCTION public.market_content_revision(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT encode(sha256(convert_to(p_payload::text,'UTF8')),'hex')
$$;

ALTER TABLE public.market_games ADD COLUMN content_key text
 GENERATED ALWAYS AS (public.market_content_key(payload)) STORED;
CREATE INDEX market_games_content_key_idx ON public.market_games(content_key)
 WHERE status IN ('pending','published') AND content_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.market_payload_questions(p_payload jsonb)
RETURNS TABLE(question_pos integer,question_text text,question_norm text,answer_keys text[])
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT ord::integer,q->>'text',public.market_normalize_content(q->>'text'),
 coalesce((SELECT array_agg(DISTINCT public.market_normalize_content(a->>'text') COLLATE "C" ORDER BY public.market_normalize_content(a->>'text') COLLATE "C")
 FROM jsonb_array_elements(coalesce(q->'answers','[]'::jsonb)) a),'{}'::text[])
 FROM jsonb_array_elements(coalesce(p_payload->'questions','[]'::jsonb)) WITH ORDINALITY t(q,ord)
$$;

CREATE OR REPLACE FUNCTION public.market_embedding_text(p_text text,p_answers text[])
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT btrim(coalesce(p_text,''))||E'\n'||array_to_string(p_answers,E'\n')
$$;
CREATE OR REPLACE FUNCTION public.market_embedding_inputs(p_payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('question_pos',q.question_pos,'text',public.market_embedding_text(q.question_text,q.answer_keys)) ORDER BY q.question_pos),'[]'::jsonb)
 FROM public.market_payload_questions(p_payload) q
$$;
REVOKE ALL ON FUNCTION public.market_embedding_inputs(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.market_embedding_inputs(jsonb) TO service_role;

CREATE TABLE public.market_game_questions (
 game_id uuid NOT NULL REFERENCES public.market_games(id) ON DELETE CASCADE,
 question_pos integer NOT NULL CHECK(question_pos>0),
 source_revision text NOT NULL,
 question_text text NOT NULL,
 question_norm text NOT NULL,
 answer_keys text[] NOT NULL,
 embedding public.vector(384),
 embedding_model text,
 embedding_question_key text,
 embedded_at timestamptz,
 PRIMARY KEY(game_id,question_pos),
 CHECK((embedding IS NULL AND embedding_model IS NULL AND embedding_question_key IS NULL AND embedded_at IS NULL)
   OR (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedding_question_key IS NOT NULL AND embedded_at IS NOT NULL))
);
ALTER TABLE public.market_game_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_game_questions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.market_game_questions TO service_role;
GRANT SELECT ON public.market_game_questions TO agent_reader;
CREATE INDEX market_game_questions_norm_idx ON public.market_game_questions USING gin(question_norm gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.market_sync_questions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload THEN RETURN NEW; END IF;
 DELETE FROM public.market_game_questions WHERE game_id=NEW.id AND question_pos>jsonb_array_length(NEW.payload->'questions');
 INSERT INTO public.market_game_questions AS existing_question(game_id,question_pos,source_revision,question_text,question_norm,answer_keys)
 SELECT NEW.id,q.question_pos,public.market_content_revision(NEW.payload),q.question_text,q.question_norm,q.answer_keys
 FROM public.market_payload_questions(NEW.payload) q
 ON CONFLICT(game_id,question_pos) DO UPDATE SET
 source_revision=excluded.source_revision,question_text=excluded.question_text,question_norm=excluded.question_norm,answer_keys=excluded.answer_keys,
 embedding=CASE WHEN existing_question.question_norm=excluded.question_norm AND existing_question.answer_keys=excluded.answer_keys THEN existing_question.embedding ELSE NULL END,
 embedding_model=CASE WHEN existing_question.question_norm=excluded.question_norm AND existing_question.answer_keys=excluded.answer_keys THEN existing_question.embedding_model ELSE NULL END,
 embedding_question_key=CASE WHEN existing_question.question_norm=excluded.question_norm AND existing_question.answer_keys=excluded.answer_keys THEN existing_question.embedding_question_key ELSE NULL END,
 embedded_at=CASE WHEN existing_question.question_norm=excluded.question_norm AND existing_question.answer_keys=excluded.answer_keys THEN existing_question.embedded_at ELSE NULL END;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.market_sync_questions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER market_sync_questions AFTER INSERT OR UPDATE OF payload ON public.market_games
 FOR EACH ROW EXECUTE FUNCTION public.market_sync_questions();
INSERT INTO public.market_game_questions(game_id,question_pos,source_revision,question_text,question_norm,answer_keys)
 SELECT g.id,q.question_pos,public.market_content_revision(g.payload),q.question_text,q.question_norm,q.answer_keys
 FROM public.market_games g CROSS JOIN LATERAL public.market_payload_questions(g.payload) q;

-- Raport jest wyłącznie dla moderatora. Nigdy nie udostępnia pending autorom.
CREATE OR REPLACE FUNCTION public.market_uniqueness_report(p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT NULL,p_lang text DEFAULT 'pl',p_vectors jsonb DEFAULT NULL,p_model text DEFAULT 'paraphrase-multilingual-minilm-l12-v2-qa-v1')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE body jsonb; language text; own_key text; revision text; n integer; result jsonb; source_indexed integer; corpus_total integer; corpus_indexed integer; corpus_revision text;
BEGIN
 IF p_id IS NOT NULL THEN
   SELECT payload,lang INTO body,language FROM public.market_games WHERE id=p_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 ELSE body:=p_payload;language:=p_lang;
 END IF;
 IF body IS NULL OR jsonb_typeof(body->'questions') IS DISTINCT FROM 'array' THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_payload');
 END IF;
 n:=jsonb_array_length(body->'questions');
 IF n<1 OR n>100 THEN RETURN jsonb_build_object('ok',false,'error','invalid_question_count'); END IF;
 own_key:=public.market_content_key(body);revision:=public.market_content_revision(body);
 WITH source AS MATERIALIZED(
 SELECT q.*,coalesce(saved.embedding,provided.embedding) embedding FROM public.market_payload_questions(body) q
 LEFT JOIN public.market_game_questions saved ON saved.game_id=p_id AND saved.question_pos=q.question_pos
   AND saved.source_revision=revision AND saved.embedding_model=p_model
 LEFT JOIN LATERAL(SELECT (v->'embedding')::text::public.vector(384) embedding
   FROM jsonb_array_elements(coalesce(p_vectors,'[]'::jsonb)) v WHERE (v->>'question_pos')::integer=q.question_pos LIMIT 1) provided ON true),
 candidates AS MATERIALIZED(SELECT id,title,lang,status,origin,content_key,payload FROM public.market_games
   WHERE status IN ('pending','published') AND (p_id IS NULL OR id<>p_id)
   AND (lang=language OR content_key=own_key)),
 raw_pairs AS MATERIALIZED(
 SELECT g.id,s.question_pos source_pos,c.question_pos candidate_pos,s.question_text source_text,c.question_text candidate_text,
   s.question_norm=c.question_norm exact_question,s.answer_keys source_answers,c.answer_keys candidate_answers,
   similarity(s.question_norm,c.question_norm)::double precision lexical,
   CASE WHEN s.embedding IS NOT NULL AND c.embedding_model=p_model AND c.embedding IS NOT NULL
     THEN (1-(s.embedding <=> c.embedding))::double precision ELSE NULL END semantic,
   (SELECT count(*)::double precision FROM (SELECT unnest(s.answer_keys) INTERSECT SELECT unnest(c.answer_keys)) shared)
    / greatest(1,(SELECT count(*) FROM (SELECT unnest(s.answer_keys) UNION SELECT unnest(c.answer_keys)) all_answers)) answer_overlap
 FROM source s CROSS JOIN candidates g JOIN public.market_game_questions c ON c.game_id=g.id
 WHERE similarity(s.question_norm,c.question_norm)>=0.38 OR s.question_norm=c.question_norm
   OR (s.embedding IS NOT NULL AND c.embedding_model=p_model AND c.embedding IS NOT NULL AND 1-(s.embedding <=> c.embedding)>=0.70)),
 ranked AS(
 SELECT *,row_number() OVER(PARTITION BY id,source_pos ORDER BY exact_question DESC,greatest(lexical,coalesce(semantic,0)) DESC,answer_overlap DESC,abs(candidate_pos-source_pos),candidate_pos) source_rank
 FROM raw_pairs WHERE exact_question OR lexical>=0.80 OR (lexical>=0.62 AND answer_overlap>=0.2) OR (lexical>=0.4 AND answer_overlap>=0.5) OR semantic>=0.70),
 -- Jedno pytanie liczymy tylko raz po każdej stronie porównania.
 unique_pairs AS(SELECT *,row_number() OVER(PARTITION BY id,candidate_pos ORDER BY exact_question DESC,greatest(lexical,coalesce(semantic,0)) DESC,source_pos) candidate_rank
 FROM ranked WHERE source_rank=1),
 matches AS(
 SELECT g.id,g.title,g.lang,g.status,g.origin,g.content_key=own_key exact_content,
   count(p.id)::integer matched_questions,count(p.id) FILTER(WHERE p.exact_question)::integer identical_questions,
   jsonb_array_length(g.payload->'questions') candidate_questions,
   coalesce(jsonb_agg(jsonb_build_object('source_pos',p.source_pos,'candidate_pos',p.candidate_pos,
     'source_text',p.source_text,'candidate_text',p.candidate_text,'source_answers',p.source_answers,'candidate_answers',p.candidate_answers,'method',CASE WHEN p.exact_question THEN 'exact_question' WHEN p.semantic>=0.70 AND p.semantic>p.lexical THEN 'semantic_and_answers' ELSE 'text_and_answers' END,
     'score',round(greatest(p.lexical,coalesce(p.semantic,0))::numeric,3),'lexical_score',round(p.lexical::numeric,3),'semantic_score',round(p.semantic::numeric,3),'answer_overlap',round(p.answer_overlap::numeric,3))
     ORDER BY p.exact_question DESC,p.lexical DESC,p.source_pos) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) question_pairs
 FROM candidates g LEFT JOIN unique_pairs p ON p.id=g.id AND p.candidate_rank=1
 GROUP BY g.id,g.title,g.lang,g.status,g.origin,g.content_key,g.payload
 HAVING g.content_key=own_key OR count(p.id)>=greatest(2,ceil(n*0.3)::integer)),
 limited AS(SELECT * FROM matches ORDER BY exact_content DESC,matched_questions DESC,identical_questions DESC,id LIMIT 12)
 SELECT coalesce(jsonb_agg(to_jsonb(limited) ORDER BY exact_content DESC,matched_questions DESC,identical_questions DESC,id),'[]'::jsonb) INTO result FROM limited;
 SELECT count(*) FILTER(WHERE embedding IS NOT NULL AND embedding_model=p_model) INTO source_indexed
   FROM public.market_game_questions WHERE game_id=p_id AND source_revision=revision;
 IF p_id IS NULL AND p_vectors IS NOT NULL THEN source_indexed:=jsonb_array_length(p_vectors); END IF;
 SELECT count(*),count(*) FILTER(WHERE q.embedding IS NOT NULL AND q.embedding_model=p_model)
 INTO corpus_total,corpus_indexed FROM public.market_game_questions q JOIN public.market_games g ON g.id=q.game_id
 WHERE g.status IN ('pending','published') AND g.lang=language AND (p_id IS NULL OR g.id<>p_id);
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(g.id,g.lang,g.status,public.market_content_revision(g.payload),
   (SELECT jsonb_build_array(count(*),max(q.embedded_at)) FROM public.market_game_questions q WHERE q.game_id=g.id AND q.embedding_model=p_model AND q.embedding IS NOT NULL)) ORDER BY g.id),'[]'::jsonb)::text,'UTF8')),'hex')
 INTO corpus_revision FROM public.market_games g WHERE g.status IN ('pending','published') AND (p_id IS NULL OR g.id<>p_id);
 RETURN jsonb_build_object('ok',true,'source_id',p_id,'revision',revision,'review_key',revision||':'||corpus_revision,'checked_at',statement_timestamp(),'question_count',n,
   'method','exact_question_text_and_semantic','matches',result,
   'semantic',jsonb_build_object('model',p_model,'source_indexed',source_indexed,'source_total',n,
     'corpus_indexed',corpus_indexed,'corpus_total',corpus_total,'threshold',0.70,'context','question_and_answers',
     'complete',source_indexed=n AND corpus_indexed=corpus_total,
     'status',CASE WHEN source_indexed=n AND corpus_indexed=corpus_total THEN 'complete' ELSE 'incomplete' END));
END
$$;
REVOKE ALL ON FUNCTION public.market_uniqueness_report(uuid,jsonb,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.market_uniqueness_report(uuid,jsonb,text,jsonb,text) TO service_role;


CREATE OR REPLACE FUNCTION public.market_embedding_jobs(p_model text,p_limit integer DEFAULT 5,p_id uuid DEFAULT NULL)
RETURNS TABLE(game_id uuid,revision text,questions jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT g.id,public.market_content_revision(g.payload),jsonb_agg(jsonb_build_object('question_pos',q.question_pos,'text',public.market_embedding_text(q.question_text,q.answer_keys)) ORDER BY q.question_pos)
 FROM public.market_games g JOIN public.market_game_questions q ON q.game_id=g.id
 WHERE g.status IN ('pending','published') AND (p_id IS NULL OR g.id=p_id)
   AND (q.embedding IS NULL OR q.embedding_model IS DISTINCT FROM p_model)
 GROUP BY g.id,g.payload ORDER BY g.id LIMIT greatest(1,least(coalesce(p_limit,5),25))
$$;
REVOKE ALL ON FUNCTION public.market_embedding_jobs(text,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.market_embedding_jobs(text,integer,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.market_store_question_embeddings(p_id uuid,p_revision text,p_model text,p_vectors jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_revision text; v jsonb; embedding_value public.vector(384); affected integer; stored integer:=0;
BEGIN
 IF p_model IS NULL OR p_model='' OR jsonb_typeof(p_vectors) IS DISTINCT FROM 'array' OR jsonb_array_length(p_vectors)>100 THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_vectors');
 END IF;
 SELECT public.market_content_revision(payload) INTO current_revision FROM public.market_games
 WHERE id=p_id AND status IN ('pending','published') FOR UPDATE;
 IF current_revision IS DISTINCT FROM p_revision THEN RETURN jsonb_build_object('ok',false,'error','stale_revision'); END IF;
 IF (SELECT count(DISTINCT x->>'question_pos') FROM jsonb_array_elements(p_vectors) x)<>jsonb_array_length(p_vectors) THEN
   RETURN jsonb_build_object('ok',false,'error','duplicate_question_pos');
 END IF;
 FOR v IN SELECT * FROM jsonb_array_elements(p_vectors) LOOP
   IF jsonb_typeof(v->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'embedding')<>384 THEN RAISE EXCEPTION 'invalid_vectors'; END IF;
   embedding_value:=(v->'embedding')::text::public.vector(384);
   IF (embedding_value <#> embedding_value)>=0 THEN RAISE EXCEPTION 'invalid_vectors'; END IF;
   UPDATE public.market_game_questions SET embedding=embedding_value,embedding_model=p_model,
     embedding_question_key=encode(sha256(convert_to(jsonb_build_array(question_norm,answer_keys)::text,'UTF8')),'hex'),embedded_at=statement_timestamp()
   WHERE game_id=p_id AND source_revision=p_revision AND question_pos=(v->>'question_pos')::integer;
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'invalid_question_pos'; END IF;
   stored:=stored+affected;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'stored',stored);
EXCEPTION WHEN invalid_text_representation OR data_exception OR raise_exception THEN
 RETURN jsonb_build_object('ok',false,'error','invalid_vectors');
END
$$;
REVOKE ALL ON FUNCTION public.market_store_question_embeddings(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.market_store_question_embeddings(uuid,text,text,jsonb) TO service_role;

COMMIT;
