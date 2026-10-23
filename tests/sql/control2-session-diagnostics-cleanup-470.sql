-- Migracja 470: stare RPC i tabela usunięte, zmiany blokad urządzeń w zdarzeniach
-- sesji (także przed startem gry), control2_session_ping bez zdarzeń.
-- Lokalna baza wg docs/sql/local-db.md.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('a4700000-0000-0000-0000-000000000001','c470@example.invalid',now());
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('b4700000-0000-0000-0000-000000000001','a4700000-0000-0000-0000-000000000001','Cleanup470','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,expires_at) VALUES
 ('c4700000-0000-0000-0000-000000000001','b4700000-0000-0000-0000-000000000001','a4700000-0000-0000-0000-000000000001',now()+interval '10 minutes');
SELECT set_config('request.jwt.claim.sub','a4700000-0000-0000-0000-000000000001',true);

DO $$
DECLARE g uuid := 'b4700000-0000-0000-0000-000000000001'; v_token text; s uuid;
BEGIN
  IF to_regclass('public.control2_device_events') IS NOT NULL THEN RAISE EXCEPTION 'old table'; END IF;
  IF to_regprocedure('public.control2_device_transport_event(uuid,text,text,jsonb,uuid,bigint)') IS NOT NULL
     OR to_regprocedure('public.control2_control_visibility_event(uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('public.control2_network_probe_event(uuid,text,text,jsonb,uuid,bigint)') IS NOT NULL
     OR to_regprocedure('public.get_control2_display_events(uuid[])') IS NOT NULL
     OR to_regprocedure('public.control2_session_ping(uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'old functions'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE stats_detail ? 'events') THEN RAISE EXCEPTION 'stats_detail.events'; END IF;

  -- Przed startem: druga instancja czeka → zdarzenie blokady w sesji uruchomienia.
  v_token := public.control_runtime_device_link(g,'host')->>'token';
  PERFORM public.control_device_instance_register(g,'host',v_token,'d4700000-0000-0000-0000-000000000001','{}');
  PERFORM public.control_device_instance_register(g,'host',v_token,'d4700000-0000-0000-0000-000000000002','{}');
  IF NOT EXISTS (SELECT 1 FROM public.control2_session_events WHERE runtime_session_id='c4700000-0000-0000-0000-000000000001'
      AND game_session_id IS NULL AND category='device_lease' AND details->>'to_state'='waiting') THEN RAISE EXCEPTION 'lease prestart'; END IF;

  INSERT INTO public.game_state(game_id,rev,top_card,step,phase,detail)
  VALUES (g,1,'rounds','r_play','PLAY','{"locks":{"gameStarted":true,"gameEnded":false}}');
  s := public._control2_active_game_session(g);
  IF (SELECT (summary #>> '{host,device_lease:waiting,n}')::int FROM public.control2_session_diag WHERE game_session_id=s) <> 1 THEN RAISE EXCEPTION 'attached'; END IF;
  UPDATE public.game_sessions SET last_seen_at = now() - interval '5 minutes' WHERE id = s;
  PERFORM public.control2_session_ping(g);
  IF (SELECT last_seen_at FROM public.game_sessions WHERE id=s) < now() - interval '1 minute' THEN RAISE EXCEPTION 'ping'; END IF;
END $$;
ROLLBACK;
\echo 'control2-session-diagnostics-cleanup-470 OK'
