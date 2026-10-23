-- Migracja 466: pomiar łącza (Control przez właściciela, odrzucenia, eksport).
-- Lokalna baza wg docs/sql/local-db.md.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000466','o466@x.pl'),('00000000-0000-0000-0000-000000000467','x466@x.pl');
INSERT INTO public.games(id, owner_id, name, type, status) VALUES
 ('00000000-0000-0000-0000-0000000004a6','00000000-0000-0000-0000-000000000466','g','prepared','ready');
INSERT INTO public.game_sessions(id, game_id, control_version) VALUES
 ('00000000-0000-0000-0000-0000000004b6','00000000-0000-0000-0000-0000000004a6',2);
INSERT INTO public.game_session_active(game_id, session_id) VALUES
 ('00000000-0000-0000-0000-0000000004a6','00000000-0000-0000-0000-0000000004b6');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000466',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE g uuid := '00000000-0000-0000-0000-0000000004a6'; ev jsonb; n int;
BEGIN
  IF NOT public.control2_net_ping() THEN RAISE EXCEPTION 'ping'; END IF;
  PERFORM public.control2_network_probe_event(g,'control',NULL,
    '{"event_id":"e1","phase":"baseline","verdict":"ok","edge_ms":80,"db_ms":140,"effective_type":"4g","connection_type":"wifi","browser_rtt_ms":100,"downlink_mbps":9.5,"visibility":"visible","online":true}');
  PERFORM public.control2_network_probe_event(g,'control',NULL,
    '{"event_id":"e2","phase":"slow","verdict":"server","edge_ms":90,"db_ms":2600,"junk":"x","effective_type":"5g"}');
  PERFORM public.control2_network_probe_event(g,'control',NULL,
    '{"event_id":"e2","phase":"slow","verdict":"server","edge_ms":90,"db_ms":2600}');
  BEGIN
    PERFORM public.control2_network_probe_event(g,'control',NULL,'{"event_id":"e3","phase":"bad"}');
    RAISE EXCEPTION 'phase not rejected';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid phase' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.control2_network_probe_event(g,'display','nokey','{"event_id":"e4","phase":"baseline"}');
    RAISE EXCEPTION 'device without key not rejected';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.control2_device_events WHERE game_id=g AND event_type='network_state';
  IF n <> 2 THEN RAISE EXCEPTION 'rows %', n; END IF;
  -- obce pola i nieznane wartości odrzucone
  IF EXISTS (SELECT 1 FROM public.control2_device_events WHERE event_id='e2' AND (details ? 'junk' OR details ? 'effective_type')) THEN RAISE EXCEPTION 'unfiltered'; END IF;
  ev := public.get_control2_display_events(ARRAY['00000000-0000-0000-0000-0000000004b6'::uuid])->'00000000-0000-0000-0000-0000000004b6';
  IF ev->0->>'category' <> 'device_network' OR ev->0->>'message' <> 'Pomiar łącza na starcie gry.' THEN RAISE EXCEPTION 'baseline %', ev->0; END IF;
  IF (ev->0->'metrics'->>'downlink_mbps')::numeric <> 9.5 OR ev->0->'metrics'->>'connection_type' <> 'wifi' THEN RAISE EXCEPTION 'metrics %', ev->0; END IF;
  IF ev->1->>'message' <> 'Wolna odpowiedź serwera przy sprawnym łączu urządzenia.' OR ev->1->'metrics'->>'impact' <> 'server' THEN RAISE EXCEPTION 'slow %', ev->1; END IF;
  RAISE NOTICE 'ok 466';
END $$;
-- inny użytkownik nie zapisze pomiaru Control cudzej gry
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000467',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.control2_network_probe_event('00000000-0000-0000-0000-0000000004a6','control',NULL,'{"event_id":"e5","phase":"baseline"}');
  RAISE EXCEPTION 'foreign owner not rejected';
EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; RAISE NOTICE 'ok 466 owner'; END $$;
ROLLBACK;
