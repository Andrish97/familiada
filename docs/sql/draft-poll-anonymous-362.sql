-- LOCAL DRAFT: full anonymous forms, browser/session scope, no IP.
CREATE OR REPLACE FUNCTION public._poll_assert_voter_362_original(p_game_id uuid, p_key text, p_voter_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.games%rowtype; t public.poll_tasks%rowtype; task_id uuid; registered uuid;
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[auth.uid()]);
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
 IF g.share_key_poll IS NULL OR g.share_key_poll IS DISTINCT FROM p_key THEN RAISE EXCEPTION 'Invalid poll key'; END IF;
 IF g.status::text<>'poll_open' THEN RAISE EXCEPTION 'Poll is not open'; END IF;
 IF p_voter_token IS NULL OR btrim(p_voter_token)='' THEN RAISE EXCEPTION 'Invalid voter token'; END IF;
 IF left(p_voter_token,5)<>'task:' THEN RETURN; END IF;
 BEGIN task_id:=substring(p_voter_token FROM 6)::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid task voter token'; END;
 SELECT * INTO t FROM public.poll_tasks WHERE id=task_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RAISE EXCEPTION 'Task expired'; END IF;
 IF NOT public._poll_task_source_active(t) THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF auth.uid() IS DISTINCT FROM t.recipient_user_id THEN RAISE EXCEPTION 'Not your task'; END IF;
 ELSE
  registered:=public._poll_registered_uid(t.recipient_email);
  IF registered IS NOT NULL AND auth.uid() IS DISTINCT FROM registered THEN RAISE EXCEPTION 'Not your task'; END IF;
  IF registered IS NOT NULL THEN UPDATE public.poll_tasks SET recipient_user_id=registered,recipient_email=NULL WHERE id=t.id; END IF;
 END IF;
END; $function$;


REVOKE ALL ON FUNCTION public._poll_assert_voter_362_original(uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.poll_anonymous_limits_prototype (
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 key_hash text NOT NULL, browser_hash text NOT NULL,
 next_allowed_at timestamptz NOT NULL DEFAULT '-infinity',
 voter_hash text, payload_hash text, in_progress boolean NOT NULL DEFAULT false,
 PRIMARY KEY(game_id,key_hash,browser_hash),
 UNIQUE(game_id,key_hash,voter_hash)
);
ALTER TABLE public.poll_anonymous_limits_prototype ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poll_anonymous_limits_prototype FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public._poll_anon_hash_prototype(p_game uuid,p_key text,p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT encode(sha256(convert_to(p_game::text||':'||p_key||':'||p_token,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION public._poll_anon_hash_prototype(uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public._poll_assert_voter(p_game_id uuid,p_key text,p_voter_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public._poll_assert_voter_362_original(p_game_id,p_key,p_voter_token);
 IF left(p_voter_token,5)='task:' OR EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id=p_game_id
  AND key_hash=public._poll_anon_hash_prototype(p_game_id,p_key,'key')
  AND voter_hash=public._poll_anon_hash_prototype(p_game_id,p_key,p_voter_token) AND in_progress)
 THEN RAISE EXCEPTION 'anonymous_full_form_required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.poll_anonymous_submit_prototype(p_game_id uuid,p_key text,p_browser_token uuid,p_voter_token uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE before_owner uuid; g public.games; bucket public.poll_anonymous_limits_prototype;
 kh text; bh text; vh text; ph text; q_count integer; item_count integer; unique_count integer; remaining integer;
BEGIN
 IF p_browser_token IS NULL OR p_voter_token IS NULL OR p_key IS NULL OR p_items IS NULL
  OR jsonb_typeof(p_items)<>'array' THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
 IF jsonb_array_length(p_items)>1000 OR octet_length(p_items::text)>256000 THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT owner_id INTO before_owner FROM public.games WHERE id=p_game_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
   PERFORM 1 FROM auth.users WHERE id=ANY(ARRAY[before_owner,auth.uid()]) ORDER BY id FOR SHARE NOWAIT;
   SELECT * INTO g FROM public.games WHERE id=p_game_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
   IF g.owner_id IS DISTINCT FROM before_owner THEN RAISE EXCEPTION 'parent changed' USING ERRCODE='55P03'; END IF;
   IF g.share_key_poll IS DISTINCT FROM p_key THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
   IF g.status::text<>'poll_open' THEN RETURN jsonb_build_object('ok',false,'error','closed'); END IF;
   IF g.type::text NOT IN('poll_text','poll_points') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
   SELECT count(*) INTO q_count FROM public.questions WHERE game_id=p_game_id;
   SELECT count(*),count(DISTINCT (item->>'question_id')::uuid) INTO item_count,unique_count FROM jsonb_array_elements(p_items) item;
   IF q_count=0 OR item_count<>q_count OR unique_count<>q_count OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_items) item LEFT JOIN public.questions q ON q.id=(item->>'question_id')::uuid AND q.game_id=p_game_id WHERE q.id IS NULL)
   THEN RETURN jsonb_build_object('ok',false,'error','incomplete_form'); END IF;
   IF g.type::text='poll_text' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) item WHERE jsonb_typeof(item->'answer_raw') IS DISTINCT FROM 'string'
      OR btrim(item->>'answer_raw')='' OR char_length(btrim(item->>'answer_raw'))>17)
    THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
    SELECT jsonb_agg(jsonb_build_object('question_id',(item->>'question_id')::uuid,'answer_raw',btrim(item->>'answer_raw'),
      'answer_norm',lower(regexp_replace(btrim(item->>'answer_raw'),'\s+',' ','g'))) ORDER BY item->>'question_id') INTO p_items FROM jsonb_array_elements(p_items) item;
   ELSE
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) item LEFT JOIN public.answers a
      ON a.id=(item->>'answer_id')::uuid AND a.question_id=(item->>'question_id')::uuid WHERE a.id IS NULL)
    THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
    SELECT jsonb_agg(jsonb_build_object('question_id',(item->>'question_id')::uuid,'answer_id',(item->>'answer_id')::uuid) ORDER BY item->>'question_id') INTO p_items FROM jsonb_array_elements(p_items) item;
   END IF;
   kh:=public._poll_anon_hash_prototype(p_game_id,p_key,'key');
   bh:=public._poll_anon_hash_prototype(p_game_id,p_key,p_browser_token::text);
   vh:=public._poll_anon_hash_prototype(p_game_id,p_key,p_voter_token::text);
   SELECT encode(sha256(convert_to(jsonb_agg(item ORDER BY item->>'question_id')::text,'UTF8')),'hex') INTO ph FROM jsonb_array_elements(p_items) item;
   IF (EXISTS(SELECT 1 FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=p_voter_token::text)
    OR EXISTS(SELECT 1 FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=p_voter_token::text))
    AND NOT EXISTS(SELECT 1 FROM public.poll_anonymous_limits_prototype WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh AND voter_hash=vh)
   THEN RETURN jsonb_build_object('ok',false,'error','attempt_reused'); END IF;
   INSERT INTO public.poll_anonymous_limits_prototype(game_id,key_hash,browser_hash) VALUES(p_game_id,kh,bh) ON CONFLICT DO NOTHING;
   SELECT * INTO bucket FROM public.poll_anonymous_limits_prototype WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh FOR UPDATE NOWAIT;
   IF bucket.voter_hash=vh THEN
    IF bucket.payload_hash IS DISTINCT FROM ph THEN RETURN jsonb_build_object('ok',false,'error','attempt_reused'); END IF;
    RETURN jsonb_build_object('ok',true,'already_submitted',true);
   END IF;
   remaining:=CASE WHEN bucket.next_allowed_at>clock_timestamp() THEN ceil(extract(epoch FROM bucket.next_allowed_at-clock_timestamp())) ELSE 0 END;
   IF remaining>0 THEN RETURN jsonb_build_object('ok',false,'error','cooldown','retry_after',remaining); END IF;
   IF EXISTS(SELECT 1 FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=p_voter_token::text)
    OR EXISTS(SELECT 1 FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=p_voter_token::text)
   THEN RETURN jsonb_build_object('ok',false,'error','attempt_reused'); END IF;
   UPDATE public.poll_anonymous_limits_prototype SET voter_hash=vh,payload_hash=ph,in_progress=true WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh;
   IF g.type::text='poll_text' THEN PERFORM public.poll_text_submit_batch(p_game_id,p_key,p_voter_token::text,p_items);
   ELSE PERFORM public.poll_points_vote_batch(p_game_id,p_key,p_voter_token::text,p_items); END IF;
   UPDATE public.poll_anonymous_limits_prototype SET in_progress=false,next_allowed_at=clock_timestamp()+interval '30 seconds' WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh;
   RETURN jsonb_build_object('ok',true,'already_submitted',false);
  EXCEPTION WHEN lock_not_available THEN IF attempt=1000 THEN RAISE; END IF; END;
  PERFORM pg_sleep(.01);
 END LOOP;
EXCEPTION WHEN unique_violation THEN
 RETURN jsonb_build_object('ok',false,'error','attempt_reused');
WHEN invalid_text_representation OR not_null_violation OR foreign_key_violation THEN
 RETURN jsonb_build_object('ok',false,'error','invalid_payload');
END $$;
REVOKE ALL ON FUNCTION public.poll_anonymous_submit_prototype(uuid,text,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_anonymous_submit_prototype(uuid,text,uuid,uuid,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public._poll_anon_cleanup_prototype() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.share_key_poll IS DISTINCT FROM OLD.share_key_poll OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.type IS DISTINCT FROM OLD.type OR NEW.status::text<>'poll_open' THEN
  DELETE FROM public.poll_anonymous_limits_prototype WHERE game_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._poll_anon_cleanup_prototype() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_poll_anonymous_cleanup_prototype ON public.games;
CREATE TRIGGER trg_poll_anonymous_cleanup_prototype AFTER UPDATE OF share_key_poll,owner_id,type,status ON public.games FOR EACH ROW EXECUTE FUNCTION public._poll_anon_cleanup_prototype();
