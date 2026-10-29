-- Prywatna pula pojedynczych pytań, trwałe zlecenia i atomowy zapis gier.
BEGIN;

CREATE TABLE public.producer_question_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 lang text NOT NULL CHECK(lang IN ('pl','en','uk')),
 kind text NOT NULL CHECK(kind IN ('search','generated')),
 enrich boolean NOT NULL DEFAULT false,
 category text NOT NULL DEFAULT '' CHECK(length(category)<=200),
 target integer NOT NULL CHECK(target>0), accepted integer NOT NULL DEFAULT 0 CHECK(accepted>=0 AND accepted<=target),
 rejected integer NOT NULL DEFAULT 0, duplicates integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','waiting_budget','waiting_provider','completed','cancelled','needs_attention')),
 queries jsonb NOT NULL DEFAULT '[]', cursor integer NOT NULL DEFAULT 0, round integer NOT NULL DEFAULT 0,
 message text NOT NULL DEFAULT '', next_run_at timestamptz NOT NULL DEFAULT now(),
 lease uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.producer_question_pool (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lang text NOT NULL CHECK(lang IN ('pl','en','uk')),
 text text NOT NULL CHECK(length(text) BETWEEN 8 AND 500), answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='array' AND jsonb_array_length(answers) BETWEEN 3 AND 6),
 category_hint text NOT NULL DEFAULT '', origin text NOT NULL CHECK(origin IN ('search','generated')),
 source jsonb NOT NULL, fingerprint text NOT NULL, answer_key text NOT NULL,
 embedding public.vector(384) NOT NULL, job_id uuid REFERENCES public.producer_question_jobs,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(lang,fingerprint)
);
CREATE TABLE public.producer_question_history (
 lang text NOT NULL, fingerprint text NOT NULL, question_norm text NOT NULL, answer_key text NOT NULL,
 embedding public.vector(384) NOT NULL, game_id uuid NOT NULL, used_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(lang,fingerprint)
);
CREATE TABLE public.producer_question_games (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, lang text NOT NULL CHECK(lang IN ('pl','en','uk')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120), description text NOT NULL CHECK(length(btrim(description))>0),
 mode text NOT NULL CHECK(mode IN ('manual','auto','category')), category text NOT NULL DEFAULT '',
 payload jsonb NOT NULL, published_id uuid REFERENCES public.market_games ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX producer_question_pool_lang_idx ON public.producer_question_pool(lang,created_at);
CREATE INDEX producer_question_jobs_ready_idx ON public.producer_question_jobs(next_run_at,updated_at) WHERE status IN ('queued','running','waiting_budget','waiting_provider');
CREATE TABLE public.producer_question_sources (
 url text PRIMARY KEY CHECK(length(url)<=2000), content_hash text NOT NULL,
 candidates jsonb NOT NULL DEFAULT '[]', fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.producer_ai_usage (
 request_id uuid PRIMARY KEY, day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 service text NOT NULL CHECK(service IN ('marketing','questions')), reserved integer NOT NULL CHECK(reserved>0),
 actual integer CHECK(actual>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX producer_ai_usage_day_idx ON public.producer_ai_usage(day,service);

CREATE FUNCTION public.qf_ai_reserve(p_id uuid,p_service text,p_tokens integer,p_limit integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE used bigint;
BEGIN
 IF p_service NOT IN ('marketing','questions') OR p_tokens<1 OR p_limit<1 THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('qf-ai:'||p_service,0));
 IF EXISTS(SELECT 1 FROM producer_ai_usage WHERE request_id=p_id) THEN RETURN true; END IF;
 SELECT coalesce(sum(coalesce(actual,reserved)),0) INTO used FROM producer_ai_usage WHERE service=p_service AND day=(now() AT TIME ZONE 'UTC')::date;
 IF used+p_tokens>p_limit THEN RETURN false; END IF;
 INSERT INTO producer_ai_usage(request_id,service,reserved) VALUES(p_id,p_service,p_tokens);
 RETURN true;
END $$;

CREATE FUNCTION public.qf_job_create(p_request uuid,p_lang text,p_kind text,p_target integer,p_category text DEFAULT '',p_enrich boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result producer_question_jobs;
BEGIN
 INSERT INTO producer_question_jobs(request_id,lang,kind,target,category,enrich) VALUES(p_request,p_lang,p_kind,p_target,btrim(p_category),p_enrich)
 ON CONFLICT(request_id) DO NOTHING;
 SELECT * INTO result FROM producer_question_jobs WHERE request_id=p_request;
 IF result.lang<>p_lang OR result.kind<>p_kind OR result.target<>p_target OR result.category<>btrim(p_category) OR result.enrich<>p_enrich THEN RAISE EXCEPTION 'request_conflict'; END IF;
 RETURN to_jsonb(result)-'lease'-'lease_until';
END $$;

CREATE FUNCTION public.qf_job_claim() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job producer_question_jobs;
BEGIN
 SELECT * INTO job FROM producer_question_jobs WHERE status IN ('queued','running','waiting_budget','waiting_provider')
 AND accepted<target AND next_run_at<=now() AND (lease_until IS NULL OR lease_until<now())
 ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE producer_question_jobs SET lease=gen_random_uuid(),lease_until=now()+interval '6 minutes',status='running',updated_at=now() WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job);
END $$;

CREATE FUNCTION public.qf_job_checkpoint(p_id uuid,p_lease uuid,p_state jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE producer_question_jobs SET
  status=CASE WHEN accepted>=target THEN 'completed' ELSE coalesce(p_state->>'status','queued') END,
  queries=coalesce(p_state->'queries',queries),cursor=coalesce((p_state->>'cursor')::integer,cursor),round=coalesce((p_state->>'round')::integer,round),
  rejected=rejected+coalesce((p_state->>'rejected')::integer,0),duplicates=duplicates+coalesce((p_state->>'duplicates')::integer,0),
  message=left(coalesce(p_state->>'message',''),500),next_run_at=now()+make_interval(secs=>greatest(2,coalesce((p_state->>'delay')::integer,5))),
  lease=NULL,lease_until=NULL,updated_at=now()
 WHERE id=p_id AND lease=p_lease AND status='running';
 RETURN FOUND;
END $$;

CREATE FUNCTION public.qf_job_control(p_id uuid,p_action text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_action NOT IN ('pause','resume','cancel') THEN RETURN false; END IF;
 UPDATE producer_question_jobs SET status=CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'queued' ELSE 'cancelled' END,
 lease=NULL,lease_until=NULL,next_run_at=now(),updated_at=now(),message=''
 WHERE id=p_id AND status NOT IN ('completed','cancelled') AND (p_action<>'resume' OR status='paused');
 RETURN FOUND;
END $$;

CREATE FUNCTION public.qf_offer(p_job uuid,p_lease uuid,p_question jsonb) RETURNS jsonb
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
 IF EXISTS(SELECT 1 FROM producer_question_pool q WHERE q.lang=job.lang AND (q.fingerprint=fp OR q.answer_key=ak OR similarity(market_normalize_content(q.text),norm)>=0.88 OR 1-(q.embedding<=>av)>=0.94)) OR
 EXISTS(SELECT 1 FROM producer_question_history h WHERE h.lang=job.lang AND (h.fingerprint=fp OR h.answer_key=ak OR similarity(h.question_norm,norm)>=0.88 OR 1-(h.embedding<=>av)>=0.94)) OR
 EXISTS(SELECT 1 FROM market_game_questions q JOIN market_games g ON g.id=q.game_id WHERE g.lang=job.lang AND g.origin='producer' AND
  (q.question_norm=norm OR similarity(q.question_norm,norm)>=0.88 OR (q.embedding IS NOT NULL AND 1-(q.embedding<=>av)>=0.94))) THEN
  RETURN jsonb_build_object('ok',false,'reason','duplicate');
 END IF;
 INSERT INTO producer_question_pool(lang,text,answers,category_hint,origin,source,fingerprint,answer_key,embedding,job_id)
 VALUES(job.lang,p_question->>'text',p_question->'answers',left(coalesce(p_question->>'category_hint',''),300),job.kind,p_question->'source',fp,ak,av,job.id) RETURNING id INTO qid;
 UPDATE producer_question_jobs SET accepted=accepted+1,status=CASE WHEN accepted+1>=target THEN 'completed' ELSE status END,updated_at=now() WHERE id=job.id;
 RETURN jsonb_build_object('ok',true,'id',qid);
END $$;

CREATE FUNCTION public.qf_candidates(p_lang text,p_embedding jsonb DEFAULT NULL,p_include_ai boolean DEFAULT false,p_limit integer DEFAULT 500) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q)-'embedding'-'fingerprint'-'answer_key'), '[]'::jsonb) FROM (
  SELECT * FROM producer_question_pool WHERE lang=p_lang AND (p_include_ai OR origin='search')
   AND (p_embedding IS NULL OR 1-(embedding<=>(p_embedding::text::public.vector(384)))>=0.18)
  ORDER BY CASE WHEN p_embedding IS NULL THEN 0 ELSE embedding<=>(p_embedding::text::public.vector(384)) END,created_at,id
  LIMIT greatest(1,least(p_limit,10000))
 ) q
$$;

CREATE FUNCTION public.qf_games_commit(p_request uuid,p_lang text,p_mode text,p_category text,p_ids jsonb,p_metadata jsonb,p_count integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE total integer; qty integer; existing jsonb; meta jsonb; game uuid; item jsonb; questions jsonb; chosen uuid[]; i integer; n integer;
BEGIN
 IF p_lang NOT IN ('pl','en','uk') OR p_mode NOT IN ('manual','auto','category') OR p_count<10 THEN RAISE EXCEPTION 'invalid_game_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('qf:'||p_lang,0));
 SELECT jsonb_agg(to_jsonb(g) ORDER BY created_at,id) INTO existing FROM producer_question_games g WHERE batch_id=p_request;
 IF existing IS NOT NULL THEN
  IF existing->0->>'lang'<>p_lang OR existing->0->>'mode'<>p_mode THEN RAISE EXCEPTION 'request_conflict'; END IF;
  RETURN existing;
 END IF;
 qty:=jsonb_array_length(p_metadata);total:=jsonb_array_length(p_ids);
 IF qty<1 OR total<>qty::bigint*p_count OR (p_mode='manual' AND qty<>1) OR (p_mode='category' AND length(btrim(p_category))=0) THEN RAISE EXCEPTION 'invalid_game_batch'; END IF;
 SELECT array_agg(value::uuid) INTO chosen FROM jsonb_array_elements_text(p_ids);
 IF (SELECT count(DISTINCT x) FROM unnest(chosen) x)<>total THEN RAISE EXCEPTION 'duplicate_selection'; END IF;
 PERFORM id FROM producer_question_pool WHERE id=ANY(chosen) AND lang=p_lang ORDER BY id FOR UPDATE;
 SELECT count(*) INTO n FROM producer_question_pool WHERE id=ANY(chosen) AND lang=p_lang;
 IF n<>total THEN RAISE EXCEPTION 'questions_unavailable'; END IF;
 FOR i IN 0..qty-1 LOOP
  meta:=p_metadata->i;
  IF length(btrim(coalesce(meta->>'title','')))=0 OR length(meta->>'title')>120 OR length(btrim(coalesce(meta->>'description','')))=0 THEN RAISE EXCEPTION 'missing_game_metadata'; END IF;
  SELECT jsonb_agg(jsonb_build_object('text',q.text,'answers',q.answers,'source',q.source,'origin',q.origin) ORDER BY ids.ord) INTO questions
   FROM unnest(chosen) WITH ORDINALITY ids(id,ord) JOIN producer_question_pool q ON q.id=ids.id WHERE ids.ord BETWEEN i*p_count+1 AND (i+1)*p_count;
  INSERT INTO producer_question_games(batch_id,lang,title,description,mode,category,payload)
   VALUES(p_request,p_lang,meta->>'title',meta->>'description',p_mode,coalesce(p_category,''),jsonb_build_object('title',meta->>'title','description',meta->>'description','questions',questions)) RETURNING id INTO game;
  INSERT INTO producer_question_history(lang,fingerprint,question_norm,answer_key,embedding,game_id)
   SELECT q.lang,q.fingerprint,market_normalize_content(q.text),q.answer_key,q.embedding,game FROM unnest(chosen) WITH ORDINALITY ids(id,ord)
   JOIN producer_question_pool q ON q.id=ids.id WHERE ids.ord BETWEEN i*p_count+1 AND (i+1)*p_count;
 END LOOP;
 DELETE FROM producer_question_pool WHERE id=ANY(chosen);
 SELECT jsonb_agg(to_jsonb(g) ORDER BY created_at,id) INTO existing FROM producer_question_games g WHERE batch_id=p_request;
 RETURN existing;
END $$;

CREATE FUNCTION public.qf_publish(p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g producer_question_games; result uuid;
BEGIN
 SELECT * INTO g FROM producer_question_games WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
 IF g.published_id IS NOT NULL THEN
  UPDATE market_games SET status='published' WHERE id=g.published_id AND origin='producer';
  RETURN jsonb_build_object('ok',true,'id',g.published_id);
 END IF;
 INSERT INTO market_games(title,description,lang,payload,origin,status) VALUES(g.title,g.description,g.lang,g.payload,'producer','published') RETURNING id INTO result;
 UPDATE producer_question_games SET published_id=result WHERE id=p_id;
 RETURN jsonb_build_object('ok',true,'id',result);
END $$;

CREATE FUNCTION public.qf_unpublish(p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE market_games SET status='withdrawn' WHERE id=(SELECT published_id FROM producer_question_games WHERE id=p_id) AND origin='producer';
 RETURN FOUND;
END $$;

DO $$ DECLARE obj record; BEGIN
 FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
 ('producer_question_jobs','producer_question_pool','producer_question_history','producer_question_games','producer_question_sources','producer_ai_usage') LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',obj.tablename);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',obj.tablename);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',obj.tablename);
 END LOOP;
 FOR obj IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'qf\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',obj.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',obj.signature);
 END LOOP;
END $$;
COMMIT;
