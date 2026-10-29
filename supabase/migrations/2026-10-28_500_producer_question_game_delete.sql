-- Usuwanie nieopublikowanych (wycofanych) gier Producenta z zakładki „Pytania i gry”.
-- Gra opublikowana nie jest usuwana — najpierw wycofanie. Pytania usuniętej gry
-- zostają w historii wykorzystania, więc nie wrócą do puli jako nowe znaleziska.
BEGIN;

CREATE FUNCTION public.qf_delete(p_id uuid,p_lang text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g producer_question_games; m market_games; target uuid; kept integer:=0;
BEGIN
 IF p_lang NOT IN ('pl','en','uk') THEN RAISE EXCEPTION 'invalid_language'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('qf:'||p_lang,0));
 SELECT * INTO g FROM producer_question_games WHERE id=p_id AND lang=p_lang FOR UPDATE;
 IF FOUND THEN target:=g.published_id;
 ELSE
  SELECT id INTO target FROM market_games WHERE id=p_id AND lang=p_lang AND origin='producer';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 END IF;
 IF target IS NOT NULL THEN
  SELECT * INTO m FROM market_games WHERE id=target FOR UPDATE;
  IF FOUND THEN
   IF m.status='published' THEN RETURN jsonb_build_object('ok',false,'reason','published'); END IF;
   -- Ślad pytań zostaje (bez pełnej kopii gry): blokuje ponowne znalezienie tej samej treści.
   INSERT INTO producer_question_history(lang,fingerprint,question_norm,answer_key,embedding,game_id)
   SELECT m.lang,encode(sha256(convert_to(q.question_norm,'UTF8')),'hex'),q.question_norm,
    encode(sha256(convert_to(coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(q.answer_keys) x),'[]'::jsonb)::text,'UTF8')),'hex'),
    q.embedding,m.id
   FROM market_game_questions q WHERE q.game_id=m.id AND q.embedding IS NOT NULL AND length(q.question_norm)>0
   ON CONFLICT(lang,fingerprint) DO NOTHING;
   GET DIAGNOSTICS kept=ROW_COUNT;
   DELETE FROM market_games WHERE id=m.id;
  END IF;
 END IF;
 IF g.id IS NOT NULL THEN DELETE FROM producer_question_games WHERE id=g.id; END IF;
 RETURN jsonb_build_object('ok',true,'history_added',kept);
END $$;

REVOKE ALL ON FUNCTION public.qf_delete(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qf_delete(uuid,text) TO service_role;
COMMIT;
