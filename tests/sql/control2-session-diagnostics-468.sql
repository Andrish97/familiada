-- Migracja 468: diagnostyka Control 2 per sesja. Lokalna baza wg docs/sql/local-db.md.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000c01','o@x.pl'),('00000000-0000-0000-0000-000000000c02','x@x.pl');
INSERT INTO public.games(id, owner_id, name, type, status) VALUES
 ('00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-000000000c01','g','prepared','ready');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id) VALUES
 ('00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-000000000c01');

-- Zdarzenie sprzed startu gry (tylko sesja uruchomienia) dołącza się do pierwszej sesji rozgrywki.
SELECT public._control2_session_event_add(NULL,'00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-000000000a01',
  'display',NULL,'diagnostic','display_state','page_state','pre',NULL,'{"visibility":"hidden"}','pre1', now()-interval '5 minutes');
INSERT INTO public.game_sessions(id, game_id, control_version) VALUES
 ('00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-000000000a01',2);
INSERT INTO public.game_session_active(game_id, session_id) VALUES
 ('00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-000000000b01');

DO $$
DECLARE g uuid := '00000000-0000-0000-0000-000000000a01'; s1 uuid := '00000000-0000-0000-0000-000000000b01';
  s2 uuid := '00000000-0000-0000-0000-000000000b02'; ev jsonb; n int;
BEGIN
  IF (SELECT runtime_session_id FROM public.game_sessions WHERE id=s1) <> '00000000-0000-0000-0000-000000000d01' THEN RAISE EXCEPTION 'runtime link'; END IF;
  IF (SELECT game_session_id FROM public.control2_session_events WHERE event_id='pre1') <> s1 THEN RAISE EXCEPTION 'prestart attach'; END IF;
  IF (SELECT (summary #>> '{display,display_state:page_state:hidden,n}')::int FROM public.control2_session_diag WHERE game_session_id=s1) <> 1 THEN RAISE EXCEPTION 'prestart summary'; END IF;

  -- Właściciel: zdarzenia Control i widoczność (stare RPC → nowa tabela).
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000c01',true);
  SET LOCAL ROLE authenticated;
  PERFORM public.control2_session_ping(g,'{"kind":"diagnostic","category":"connectivity","message":"m","devices":["buzzer"],"metrics":{"blocked_duration_ms":2500}}');
  PERFORM public.control2_session_ping(g,'{"kind":"error","message":"e"}');
  PERFORM public.control2_session_ping(g,NULL);
  IF NOT public.control2_control_visibility_event(g,'{"event_id":"v1","reason":"visibilitychange","visibility":"hidden"}') THEN RAISE EXCEPTION 'visibility'; END IF;
  PERFORM public.control2_control_visibility_event(g,'{"event_id":"v1","reason":"visibilitychange","visibility":"hidden"}');
  ev := public.control2_owner_session_events(g)->s1::text;
  IF jsonb_array_length(ev) <> 4 THEN RAISE EXCEPTION 'owner events %', ev; END IF;
  IF ev->0->>'prestart' <> 'true' THEN RAISE EXCEPTION 'prestart flag %', ev->0; END IF;
  -- Brak dostępu do tabel i odczytu admina.
  BEGIN PERFORM 1 FROM public.control2_session_events; RAISE EXCEPTION 'table readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_control2_session_events(ARRAY[s1]); RAISE EXCEPTION 'admin fn callable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000c02',true);
  BEGIN PERFORM public.control2_owner_session_events(g); RAISE EXCEPTION 'foreign owner';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; END;
  RESET ROLE;

  IF (SELECT (client_meta->>'error_count')::int FROM public.game_sessions WHERE id=s1) <> 1 THEN RAISE EXCEPTION 'error_count'; END IF;
  IF (SELECT stats_detail ? 'events' FROM public.game_sessions WHERE id=s1) THEN RAISE EXCEPTION 'stats_detail still written'; END IF;
  SELECT count(*) INTO n FROM public.control2_device_events WHERE game_id=g;
  IF n <> 0 THEN RAISE EXCEPTION 'old table grew'; END IF;
  ev := public.get_control2_session_events(ARRAY[s1])->s1::text;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(ev) e WHERE e->>'category'='display_state' AND e->>'source'='control'
      AND e->>'message' LIKE 'Stan karty Control: w tle%') THEN RAISE EXCEPTION 'visibility view %', ev; END IF;

  -- Druga sesja tej samej gry ma własny log i podsumowanie.
  UPDATE public.game_sessions SET ended_at=now() WHERE id=s1;
  DELETE FROM public.game_session_active WHERE game_id=g;
  INSERT INTO public.game_sessions(id, game_id, control_version) VALUES (s2,g,2);
  INSERT INTO public.game_session_active VALUES (g,s2);
  PERFORM public._control2_session_event_add(s2,NULL,g,'host',NULL,'diagnostic','device_network','network_state','x',NULL,
    '{"phase":"slow","verdict":"device_network","max_db_ms":1800,"source":"probe"}','n1');
  IF (SELECT event_count FROM public.control2_session_diag WHERE game_session_id=s2) <> 1 THEN RAISE EXCEPTION 'isolation s2'; END IF;
  IF (SELECT event_count FROM public.control2_session_diag WHERE game_session_id=s1) <> 4 THEN RAISE EXCEPTION 'isolation s1'; END IF;
  IF (SELECT (summary #>> '{host,device_network:slow:device_network,max_ms}')::int FROM public.control2_session_diag WHERE game_session_id=s2) <> 1800 THEN RAISE EXCEPTION 'max_ms'; END IF;

  -- Limit 3000: szczegół odrzucony, podsumowanie liczy dalej.
  UPDATE public.control2_session_diag SET event_count=3000 WHERE game_session_id=s2;
  IF public._control2_session_event_add(s2,NULL,g,'host',NULL,'diagnostic','device_network','network_state','x',NULL,
    '{"phase":"slow","verdict":"device_network","source":"probe"}','n2') THEN RAISE EXCEPTION 'limit'; END IF;
  IF (SELECT dropped_count FROM public.control2_session_diag WHERE game_session_id=s2) <> 1
     OR (SELECT (summary #>> '{host,device_network:slow:device_network,n}')::int FROM public.control2_session_diag WHERE game_session_id=s2) <> 2
    THEN RAISE EXCEPTION 'dropped summary'; END IF;

  -- Retencja: tylko szczegóły starsze niż 90 dni.
  UPDATE public.control2_session_events SET created_at=now()-interval '91 days' WHERE event_id='n1';
  IF public.control2_session_events_cleanup() <> 1 THEN RAISE EXCEPTION 'cleanup'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.control2_session_diag WHERE game_session_id=s2 AND summary ? 'host') THEN RAISE EXCEPTION 'summary removed'; END IF;

  -- Usunięcie gry: sesje znikają, diagnostyka zostaje.
  DELETE FROM public.games WHERE id=g;
  IF NOT EXISTS (SELECT 1 FROM public.control2_session_events WHERE game_session_id=s1)
     OR NOT EXISTS (SELECT 1 FROM public.control2_session_diag WHERE game_session_id=s1) THEN RAISE EXCEPTION 'kept after delete'; END IF;
END $$;
ROLLBACK;
\echo 'control2-session-diagnostics-468 OK'
