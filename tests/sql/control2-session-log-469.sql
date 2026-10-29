-- Migracja 469: control2_device_log / control2_control_log, zdarzenia przed
-- startem gry, nowe sygnały. Lokalna baza wg docs/sql/local-db.md.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('a4690000-0000-0000-0000-000000000001','log469@example.invalid',now()),
 ('a4690000-0000-0000-0000-000000000002','other469@example.invalid',now());
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('b4690000-0000-0000-0000-000000000001','a4690000-0000-0000-0000-000000000001','Log469','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,expires_at) VALUES
 ('c4690000-0000-0000-0000-000000000001','b4690000-0000-0000-0000-000000000001','a4690000-0000-0000-0000-000000000001',now()+interval '10 minutes');
SELECT set_config('request.jwt.claim.sub','a4690000-0000-0000-0000-000000000001',true);

DO $$
DECLARE
  g uuid := 'b4690000-0000-0000-0000-000000000001';
  v_token text; v_state jsonb; v_conn uuid := 'd4690000-0000-0000-0000-000000000001';
  n int; s uuid; ev jsonb;
BEGIN
  v_token := public.control_runtime_device_link(g,'display')->>'token';
  v_state := public.control_device_instance_register(g,'display',v_token,v_conn,'{"visibility":"visible"}');
  IF v_state->>'state' <> 'primary' THEN RAISE EXCEPTION 'primary %', v_state; END IF;

  -- Przed startem gry: zapis do sesji uruchomienia.
  n := public.control2_device_log(g,'display',v_token,v_conn,(v_state->>'epoch')::bigint, jsonb_build_array(
    jsonb_build_object('event_type','device_info','event_id','i1','device_class','phone','browser','safari','os','ios','battery_level',40,'charging',false,'junk text','x'),
    jsonb_build_object('event_type','wake_lock','event_id','w1','phase','denied','error_name','NotAllowedError'),
    jsonb_build_object('event_type','page_state','event_id','p1','reason','visibilitychange','visibility','hidden','note','has spaces'),
    jsonb_build_object('event_type','bogus','event_id','b1')));
  IF n <> 3 THEN RAISE EXCEPTION 'device accepted %', n; END IF;
  IF (SELECT count(*) FROM public.control2_session_events WHERE runtime_session_id='c4690000-0000-0000-0000-000000000001' AND game_session_id IS NULL) <> 3 THEN RAISE EXCEPTION 'prestart rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.control2_session_events WHERE event_id='p1' AND (details ? 'note' OR details->>'visibility_reason' <> 'visibilitychange')) THEN RAISE EXCEPTION 'sanitize'; END IF;
  IF EXISTS (SELECT 1 FROM public.control2_session_events WHERE event_id='i1' AND details ? 'junk text') THEN RAISE EXCEPTION 'sanitize key'; END IF;
  IF (SELECT category FROM public.control2_session_events WHERE event_id='w1') <> 'wake_lock' THEN RAISE EXCEPTION 'category'; END IF;

  -- Control przed startem: obserwacja i zdarzenie typowane.
  PERFORM set_config('request.jwt.claim.sub','a4690000-0000-0000-0000-000000000001',true);
  n := public.control2_control_log(g, jsonb_build_array(
    jsonb_build_object('kind','diagnostic','category','connectivity','event_id','c1','message','m','devices',jsonb_build_array('display'),'metrics',jsonb_build_object('blocked_duration_ms',1200)),
    jsonb_build_object('event_type','page_lifecycle','event_id','c2','phase','offline'),
    jsonb_build_object('kind','diagnostic','category','nope')));
  IF n <> 2 THEN RAISE EXCEPTION 'control accepted %', n; END IF;
  -- Ponowienie tej samej paczki nie dubluje.
  n := public.control2_control_log(g, jsonb_build_array(jsonb_build_object('event_type','page_lifecycle','event_id','c2','phase','offline')));
  IF n <> 0 THEN RAISE EXCEPTION 'dedupe'; END IF;

  -- Start gry: zdarzenia przygotowania dołączają się do sesji.
  UPDATE public.control2_session_events SET created_at = now() - interval '1 minute' WHERE game_session_id IS NULL;
  INSERT INTO public.game_state(game_id,rev,top_card,step,phase,detail)
  VALUES (g,1,'rounds','r_play','PLAY','{"locks":{"gameStarted":true,"gameEnded":false}}');
  s := public._control2_active_game_session(g);
  IF s IS NULL THEN RAISE EXCEPTION 'no session'; END IF;
  IF (SELECT event_count FROM public.control2_session_diag WHERE game_session_id=s) <> 5 THEN RAISE EXCEPTION 'attached %', (SELECT event_count FROM public.control2_session_diag WHERE game_session_id=s); END IF;
  IF (SELECT (summary #>> '{display,wake_lock:denied,n}')::int FROM public.control2_session_diag WHERE game_session_id=s) <> 1 THEN RAISE EXCEPTION 'summary wake'; END IF;
  n := public.control2_device_log(g,'display',v_token,v_conn,(v_state->>'epoch')::bigint,
    jsonb_build_array(jsonb_build_object('event_type','page_lifecycle','event_id','l1','phase','resume','duration_ms',8000)));
  IF n <> 1 OR (SELECT game_session_id FROM public.control2_session_events WHERE event_id='l1') <> s THEN RAISE EXCEPTION 'in-game'; END IF;
  ev := public.get_control2_session_events(ARRAY[s])->s::text;
  IF (SELECT count(*) FROM jsonb_array_elements(ev) e WHERE e->>'prestart'='true') <> 5 THEN RAISE EXCEPTION 'prestart flags %', ev; END IF;
  IF (SELECT e->'metrics'->>'battery_level' FROM jsonb_array_elements(ev) e WHERE e->>'category'='device_info') <> '40' THEN RAISE EXCEPTION 'number format'; END IF;

  -- Obcy właściciel i zły klucz.
  PERFORM set_config('request.jwt.claim.sub','a4690000-0000-0000-0000-000000000002',true);
  BEGIN PERFORM public.control2_control_log(g,'[]'); RAISE EXCEPTION 'foreign control';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; END;
  BEGIN PERFORM public.control2_device_log(g,'display','zly',v_conn,1,'[]'); RAISE EXCEPTION 'bad key';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
\echo 'control2-session-log-469 OK'
