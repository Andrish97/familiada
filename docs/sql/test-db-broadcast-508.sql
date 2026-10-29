-- Tylko izolowana baza po local-stubs + local-realtime-stub + schema.sql + migracje 508–510.
-- Kanał Control (game-control:, 510) liczony osobno — tu tylko kanały urządzeń.
CREATE TEMP VIEW device_messages AS SELECT * FROM realtime.messages WHERE topic LIKE 'game-state:%' AND event = 'state';
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-5080-0000-0000-000000000001','owner508@example.com');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-5080-0000-0000-000000000001','owner508@example.com','owner508');
INSERT INTO public.games(id,owner_id,name) VALUES ('cccccccc-5080-0000-0000-000000000003','aaaaaaaa-5080-0000-0000-000000000001','Bcast508');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id)
VALUES ('5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','aaaaaaaa-5080-0000-0000-000000000001');
-- Wyświetlacz i Prowadzący z żywym lease; Przycisk z wygasłym.
INSERT INTO public.control_device_connections(id,session_id,game_id,device_type,state,epoch) VALUES
  ('d0000000-5080-0000-0000-00000000000d','5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','display','primary',1),
  ('d0000000-5080-0000-0000-00000000000e','5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','host','primary',1),
  ('d0000000-5080-0000-0000-00000000000f','5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','buzzer','primary',1);
INSERT INTO public.control_device_slots(session_id,game_id,device_type,primary_connection_id,epoch,lease_expires_at) VALUES
  ('5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','display','d0000000-5080-0000-0000-00000000000d',1,clock_timestamp()+interval '12 seconds'),
  ('5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','host','d0000000-5080-0000-0000-00000000000e',1,clock_timestamp()+interval '12 seconds'),
  ('5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','buzzer','d0000000-5080-0000-0000-00000000000f',1,clock_timestamp()-interval '1 second');

INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-5080-0000-0000-000000000003',5,'rounds','r_play','PLAY','A','{"locks":{"gameStarted":true}}');
SELECT pg_temp.check_result((SELECT count(*)=2 FROM device_messages), 'zapis wysyła do dwóch urządzeń z żywym lease');
SELECT pg_temp.check_result((SELECT array_agg(topic ORDER BY topic) FROM device_messages) = ARRAY[
  'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000d',
  'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000e'],
  'tematy: własne połączenia Wyświetlacza i Prowadzącego, bez wygasłego Przycisku');
SELECT pg_temp.check_result((SELECT bool_and(private AND event='state' AND extension='broadcast'
  AND (payload->'row'->>'rev')::bigint=5 AND payload->'row'->>'step'='r_play') FROM device_messages),
  'wiadomość: prywatna, cały wiersz stanu');

UPDATE public.game_state SET rev=6, step='r_duel' WHERE game_id='cccccccc-5080-0000-0000-000000000003';
SELECT pg_temp.check_result((SELECT count(*)=2 FROM device_messages WHERE (payload->'row'->>'rev')::bigint=6),
  'kolejna zmiana też trafia do obu urządzeń');

-- Autoryzacja kanału (polityka na realtime.messages).
CREATE TEMP TABLE claims AS SELECT jsonb_build_object('role','anon','exp',extract(epoch FROM now())::bigint+3600,
  'game_id','cccccccc-5080-0000-0000-000000000003','device_type','display','session_id','5e550000-5080-0000-0000-000000000001',
  'connection_id','d0000000-5080-0000-0000-00000000000d','epoch',1) AS c;
SELECT pg_temp.check_result(public.control_device_broadcast_topic_valid(
  'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000d',(SELECT c FROM claims)),
  'urządzenie dołącza do własnego kanału');
SELECT pg_temp.check_result(NOT public.control_device_broadcast_topic_valid(
  'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000e',(SELECT c FROM claims)),
  'cudzy kanał (Prowadzący) — brak dostępu');
SELECT pg_temp.check_result(NOT public.control_device_broadcast_topic_valid(
  'game-state:x:y',(SELECT c || '{"game_id":"nie-uuid"}' FROM claims)),
  'niepoprawny token — brak dostępu bez błędu');
SELECT pg_temp.check_result((SELECT count(*)=1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages'
  AND policyname='game_state_device_broadcast_read'), 'polityka odbioru na realtime.messages');

-- Zastąpienie Wyświetlacza (nowa epoka): stary token traci dostęp, nowa zmiana idzie do nowego połączenia.
UPDATE public.control_device_connections SET state='replaced' WHERE id='d0000000-5080-0000-0000-00000000000d';
INSERT INTO public.control_device_connections(id,session_id,game_id,device_type,state,epoch)
VALUES ('d0000000-5080-0000-0000-0000000000dd','5e550000-5080-0000-0000-000000000001','cccccccc-5080-0000-0000-000000000003','display','primary',2);
UPDATE public.control_device_slots SET primary_connection_id='d0000000-5080-0000-0000-0000000000dd', epoch=2
  WHERE session_id='5e550000-5080-0000-0000-000000000001' AND device_type='display';
SELECT pg_temp.check_result(NOT public.control_device_broadcast_topic_valid(
  'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000d',(SELECT c FROM claims)),
  'zastąpione urządzenie traci dostęp od razu');
UPDATE public.game_state SET rev=7 WHERE game_id='cccccccc-5080-0000-0000-000000000003';
SELECT pg_temp.check_result((SELECT count(*)=0 FROM device_messages WHERE (payload->'row'->>'rev')::bigint=7
  AND topic LIKE '%00000000000d'), 'zastąpione urządzenie nie dostaje nowych zmian');
SELECT pg_temp.check_result((SELECT count(*)=1 FROM device_messages WHERE (payload->'row'->>'rev')::bigint=7
  AND topic LIKE '%0000000000dd'), 'nowe połączenie Wyświetlacza dostaje zmiany');

-- Dołączenie do kanału tak jak sprawdza je serwer Realtime: rola anon,
-- claims tokenu, temat kanału, odczyt realtime.messages (polityka 508,
-- USAGE na schemacie realtime z 509). SELECT na messages ma anon na produkcji.
GRANT SELECT ON realtime.messages TO anon;
CREATE TEMP TABLE claims_new AS SELECT (SELECT c FROM claims) || jsonb_build_object(
  'connection_id','d0000000-5080-0000-0000-0000000000dd','epoch',2) AS c;
GRANT SELECT ON claims_new, claims TO anon;
SELECT set_config('request.jwt.claims', (SELECT c::text FROM claims_new), true);
SELECT set_config('realtime.topic', 'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-0000000000dd', true);
SET LOCAL ROLE anon;
SELECT pg_temp.check_result((SELECT count(*)>0 FROM realtime.messages
  WHERE topic='game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-0000000000dd'),
  'anon z tokenem urządzenia czyta własny kanał');
SELECT set_config('realtime.topic', 'game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000e', true);
SELECT pg_temp.check_result((SELECT count(*)=0 FROM realtime.messages
  WHERE topic='game-state:cccccccc-5080-0000-0000-000000000003:d0000000-5080-0000-0000-00000000000e'),
  'anon z tokenem Wyświetlacza nie czyta kanału Prowadzącego');
RESET ROLE;

-- Koniec sesji: nikt nie dostaje kolejnych zmian.
UPDATE public.control_runtime_sessions SET ended_at=now() WHERE id='5e550000-5080-0000-0000-000000000001';
UPDATE public.game_state SET rev=8 WHERE game_id='cccccccc-5080-0000-0000-000000000003';
SELECT pg_temp.check_result((SELECT count(*)=0 FROM device_messages WHERE (payload->'row'->>'rev')::bigint=8),
  'po zakończeniu sesji brak wysyłki');

-- Awaria wysyłki nie blokuje zapisu stanu.
UPDATE public.control_runtime_sessions SET ended_at=NULL WHERE id='5e550000-5080-0000-0000-000000000001';
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean default true)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'realtime down'; END $$;
UPDATE public.game_state SET rev=9 WHERE game_id='cccccccc-5080-0000-0000-000000000003';
SELECT pg_temp.check_result((SELECT rev=9 FROM public.game_state WHERE game_id='cccccccc-5080-0000-0000-000000000003'),
  'błąd realtime.send nie przerywa zapisu');
ROLLBACK;
