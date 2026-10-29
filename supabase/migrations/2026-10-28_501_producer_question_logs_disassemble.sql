-- Dziennik zleceń zbierania pytań (jak marketing_search_logs dla kontaktów), osobno dla każdego języka.
-- Tylko serwer (service_role): zapis z usługi pytań, odczyt przez prywatny Worker panelu.
-- qf_disassemble: rozłożenie nieopublikowanej gry Producenta z powrotem na pytania puli.
BEGIN;
CREATE TABLE public.producer_question_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lang text NOT NULL CHECK(lang IN ('pl','en','uk')),
 job_id uuid REFERENCES public.producer_question_jobs ON DELETE SET NULL,
 level text NOT NULL DEFAULT 'info' CHECK(level IN ('info','success','warning','error')),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX producer_question_logs_lang_idx ON public.producer_question_logs(lang,created_at DESC,id DESC);
ALTER TABLE public.producer_question_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producer_question_logs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.producer_question_logs TO service_role;

-- p_questions: pytania gry z wektorami (usługa liczy je modelem znaczenia przed wywołaniem).
-- Gra opublikowana: odmowa. Pytanie niepoprawne albo już obecne w puli, w historii innej
-- gry lub w innej grze Producenta jest pomijane (unikalność puli bez zmian).
CREATE FUNCTION public.qf_disassemble(p_id uuid,p_lang text,p_questions jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g producer_question_games; m market_games; target uuid; g_title text; q jsonb; a jsonb; norm text; fp text; ak text; av public.vector(384);
 n integer; restored integer:=0; skipped integer:=0; duplicates integer:=0; bad boolean; q_origin text; src jsonb;
BEGIN
 IF p_lang NOT IN ('pl','en','uk') OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('qf:'||p_lang,0));
 SELECT * INTO g FROM producer_question_games WHERE id=p_id AND lang=p_lang FOR UPDATE;
 IF FOUND THEN target:=g.published_id; g_title:=g.title;
 ELSE
  SELECT mg.id,mg.title INTO target,g_title FROM market_games mg WHERE mg.id=p_id AND mg.lang=p_lang AND mg.origin='producer';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 END IF;
 IF target IS NOT NULL THEN
  SELECT * INTO m FROM market_games WHERE id=target FOR UPDATE;
  IF FOUND AND m.status='published' THEN RETURN jsonb_build_object('ok',false,'reason','published'); END IF;
 END IF;
 -- Ślady tej gry znikają razem z nią; pytania wracają do puli jako dostępne.
 DELETE FROM producer_question_history WHERE lang=p_lang AND game_id IN (p_id,coalesce(target,p_id));
 IF m.id IS NOT NULL THEN DELETE FROM market_games WHERE id=m.id; END IF;
 IF g.id IS NOT NULL THEN DELETE FROM producer_question_games WHERE id=g.id; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  norm:=public.market_normalize_content(q->>'text');
  n:=CASE WHEN jsonb_typeof(q->'answers')='array' THEN jsonb_array_length(q->'answers') ELSE 0 END;
  bad:=length(coalesce(norm,''))<8 OR length(q->>'text')>500 OR n NOT BETWEEN 3 AND 6;
  IF NOT bad THEN
   FOR a IN SELECT value FROM jsonb_array_elements(q->'answers') LOOP
    IF length(btrim(coalesce(a->>'text','')))<1 OR length(a->>'text')>120 OR jsonb_typeof(a->'fixed_points') IS DISTINCT FROM 'number'
     OR (a->>'fixed_points')::numeric<>trunc((a->>'fixed_points')::numeric) OR (a->>'fixed_points')::numeric NOT BETWEEN 1 AND 100 THEN bad:=true; END IF;
   END LOOP;
  END IF;
  IF NOT bad THEN
   bad:=(SELECT count(DISTINCT market_normalize_content(value->>'text')) FROM jsonb_array_elements(q->'answers'))<>n
    OR (SELECT sum((value->>'fixed_points')::integer) FROM jsonb_array_elements(q->'answers'))>100
    OR jsonb_typeof(q->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'embedding')<>384;
  END IF;
  IF bad THEN skipped:=skipped+1; CONTINUE; END IF;
  fp:=encode(sha256(convert_to(norm,'UTF8')),'hex');
  SELECT encode(sha256(convert_to(jsonb_agg(market_normalize_content(value->>'text') ORDER BY market_normalize_content(value->>'text'))::text,'UTF8')),'hex') INTO ak FROM jsonb_array_elements(q->'answers');
  av:=(q->'embedding')::text::public.vector(384);
  IF EXISTS(SELECT 1 FROM producer_question_pool x WHERE x.lang=p_lang AND (x.fingerprint=fp OR x.answer_key=ak)) OR
   EXISTS(SELECT 1 FROM producer_question_history h WHERE h.lang=p_lang AND (h.fingerprint=fp OR h.answer_key=ak)) OR
   EXISTS(SELECT 1 FROM market_game_questions x JOIN market_games mg ON mg.id=x.game_id WHERE mg.lang=p_lang AND mg.origin='producer' AND x.question_norm=norm) THEN
   duplicates:=duplicates+1; CONTINUE;
  END IF;
  q_origin:=CASE WHEN q->>'origin' IN ('search','generated') THEN q->>'origin' ELSE 'generated' END;
  src:=CASE WHEN jsonb_typeof(q->'source')='object' THEN q->'source' ELSE jsonb_build_object('points_origin','estimated') END;
  IF q_origin='search' AND coalesce(src->>'url','') !~ '^https?://' THEN q_origin:='generated'; END IF;
  INSERT INTO producer_question_pool(lang,text,answers,category_hint,origin,source,fingerprint,answer_key,embedding)
  VALUES(p_lang,q->>'text',q->'answers',left(coalesce(q->>'category_hint',''),300),q_origin,src||jsonb_build_object('from_game',left(coalesce(g_title,''),120)),fp,ak,av);
  restored:=restored+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'restored',restored,'skipped',skipped,'duplicates',duplicates);
END $$;
REVOKE ALL ON FUNCTION public.qf_disassemble(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qf_disassemble(uuid,text,jsonb) TO service_role;
COMMIT;
