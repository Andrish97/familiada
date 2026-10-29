-- Tylko izolowana baza po local-stubs + local-realtime-stub + schema.sql + migracje 508–510.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-5100-0000-0000-000000000001','owner510@example.com'),
  ('aaaaaaaa-5100-0000-0000-000000000002','other510@example.com');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-5100-0000-0000-000000000001','owner510@example.com','owner510'),
  ('aaaaaaaa-5100-0000-0000-000000000002','other510@example.com','other510');
INSERT INTO public.games(id,owner_id,name) VALUES ('cccccccc-5100-0000-0000-000000000003','aaaaaaaa-5100-0000-0000-000000000001','Ctrl510');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id)
VALUES ('5e550000-5100-0000-0000-000000000001','cccccccc-5100-0000-0000-000000000003','aaaaaaaa-5100-0000-0000-000000000001');
INSERT INTO public.control_device_connections(id,session_id,game_id,device_type,state,epoch) VALUES
  ('d0000000-5100-0000-0000-00000000000d','5e550000-5100-0000-0000-000000000001','cccccccc-5100-0000-0000-000000000003','display','primary',1),
  ('d0000000-5100-0000-0000-00000000000f','5e550000-5100-0000-0000-000000000001','cccccccc-5100-0000-0000-000000000003','buzzer','primary',1);
INSERT INTO public.control_device_slots(session_id,game_id,device_type,primary_connection_id,epoch,lease_expires_at) VALUES
  ('5e550000-5100-0000-0000-000000000001','cccccccc-5100-0000-0000-000000000003','display','d0000000-5100-0000-0000-00000000000d',1,clock_timestamp()+interval '12 seconds'),
  ('5e550000-5100-0000-0000-000000000001','cccccccc-5100-0000-0000-000000000003','buzzer','d0000000-5100-0000-0000-00000000000f',1,clock_timestamp()+interval '12 seconds');

INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-5100-0000-0000-000000000003',5,'rounds','r_duel','PLAY','A','{"locks":{"gameStarted":true}}');
SELECT pg_temp.check_result((SELECT count(*)=1 FROM realtime.messages WHERE topic='game-control:cccccccc-5100-0000-0000-000000000003'
  AND event='state' AND (payload->'row'->>'rev')::bigint=5), 'stan trafia na kanał Control');
SELECT pg_temp.check_result((SELECT count(*)=2 FROM realtime.messages WHERE topic LIKE 'game-state:%' AND event='state'),
  'stan trafia do obu urządzeń');

DELETE FROM realtime.messages;
INSERT INTO public.game_state_display_completion(game_id,requested_rev,rendered_rev,requested_at,rendered_at)
VALUES ('cccccccc-5100-0000-0000-000000000003',5,5,now(),now())
ON CONFLICT (game_id) DO UPDATE SET rendered_rev=5, rendered_at=now();
SELECT pg_temp.check_result((SELECT count(*)=3 FROM realtime.messages WHERE event='completion'
  AND (payload->'row'->>'rendered_rev')::bigint=5), 'potwierdzenie planszy: Control + oba urządzenia');

-- Kanał Control: tylko właściciel.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-5100-0000-0000-000000000001',true);
SELECT pg_temp.check_result(public.control_owner_topic_valid('game-control:cccccccc-5100-0000-0000-000000000003'), 'właściciel: game-control');
SELECT pg_temp.check_result(public.control_owner_topic_valid('game-signal:cccccccc-5100-0000-0000-000000000003'), 'właściciel: game-signal');
SELECT pg_temp.check_result(NOT public.control_owner_topic_valid('game-control:nie-uuid'), 'zły temat — brak dostępu bez błędu');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-5100-0000-0000-000000000002',true);
SELECT pg_temp.check_result(NOT public.control_owner_topic_valid('game-control:cccccccc-5100-0000-0000-000000000003'), 'inny użytkownik: brak dostępu');

-- Sygnał Wyświetlacza: zapis tylko Wyświetlacz z żywym lease.
CREATE TEMP TABLE claims AS SELECT jsonb_build_object('role','anon','exp',extract(epoch FROM now())::bigint+3600,
  'game_id','cccccccc-5100-0000-0000-000000000003','device_type','display','session_id','5e550000-5100-0000-0000-000000000001',
  'connection_id','d0000000-5100-0000-0000-00000000000d','epoch',1) AS c;
SELECT pg_temp.check_result(public.control_display_signal_topic_valid('game-signal:cccccccc-5100-0000-0000-000000000003',(SELECT c FROM claims)),
  'Wyświetlacz: game-signal');
SELECT pg_temp.check_result(NOT public.control_display_signal_topic_valid('game-signal:cccccccc-5100-0000-0000-000000000003',
  (SELECT c || '{"device_type":"buzzer","connection_id":"d0000000-5100-0000-0000-00000000000f"}' FROM claims)),
  'Przycisk: brak dostępu do game-signal');
SELECT pg_temp.check_result(NOT public.control_display_signal_topic_valid('game-control:cccccccc-5100-0000-0000-000000000003',(SELECT c FROM claims)),
  'Wyświetlacz: brak dostępu do game-control');

GRANT SELECT, INSERT ON realtime.messages TO anon;
GRANT SELECT ON claims TO anon;
SELECT set_config('request.jwt.claims', (SELECT c::text FROM claims), true);
SELECT set_config('realtime.topic', 'game-signal:cccccccc-5100-0000-0000-000000000003', true);
SET LOCAL ROLE anon;
INSERT INTO realtime.messages(topic,extension,event,payload,private)
VALUES ('game-signal:cccccccc-5100-0000-0000-000000000003','broadcast','display_transition_started','{"sound_cue_seq":1}',true);
RESET ROLE;
SELECT pg_temp.check_result(true, 'Wyświetlacz zapisuje sygnał (polityka INSERT)');
SELECT set_config('request.jwt.claims', (SELECT (c || '{"device_type":"host"}')::text FROM claims), true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  INSERT INTO realtime.messages(topic,extension,event,payload,private)
  VALUES ('game-signal:cccccccc-5100-0000-0000-000000000003','broadcast','x','{}',true);
  RAISE EXCEPTION 'FAIL: Prowadzący zapisał sygnał';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: Prowadzący nie zapisze sygnału';
END $$;
RESET ROLE;
ROLLBACK;
