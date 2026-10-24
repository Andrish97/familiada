-- Tylko izolowana baza po local-stubs + schema.sql + migracja 483.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;

INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-4830-0000-0000-000000000001','owner483@example.com');
INSERT INTO public.profiles(id,email,username) VALUES
  ('aaaaaaaa-4830-0000-0000-000000000001','owner483@example.com','owner483');
INSERT INTO public.games(id,owner_id,name) VALUES
  ('cccccccc-4830-0000-0000-000000000001','aaaaaaaa-4830-0000-0000-000000000001','Final483'),
  ('cccccccc-4830-0000-0000-000000000002','aaaaaaaa-4830-0000-0000-000000000001','Rounds483'),
  ('cccccccc-4830-0000-0000-000000000003','aaaaaaaa-4830-0000-0000-000000000001','Restart483');

-- Gra 1: rundy 100:300, finał 150 dla B dochodzi do f_end bez „Zakończ”.
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-4830-0000-0000-000000000001',1,'rounds','r_roundStart',NULL,NULL,
  '{"locks":{"gameStarted":true},"rounds":{"roundNo":1,"totals":{"A":100,"B":300}},"settings":{"finalTarget":200,"endScreenMode":"money"}}');
UPDATE public.game_state SET rev=2, top_card='final', step='f_end',
  detail=detail || '{"final":{"questions":[{"id":"q1"}],"winnerTeam":"B","runtime":{"sum":150,"reached200":false}}}'
WHERE game_id='cccccccc-4830-0000-0000-000000000001';
SELECT pg_temp.check_result((SELECT status='playing' AND final_points=150 AND team_b_score=300
  AND stats_detail->>'end_reason'='final_complete'
  FROM public.game_sessions WHERE game_id='cccccccc-4830-0000-0000-000000000001'),
  'f_end bez Zakończ: sesja otwarta, finał jeszcze nie w wyniku drużyny');

INSERT INTO public.control_runtime_sessions(game_id,owner_id,expires_at) VALUES
  ('cccccccc-4830-0000-0000-000000000001','aaaaaaaa-4830-0000-0000-000000000001',now()-interval '1 minute');
SELECT public.control_runtime_expire_one(id) FROM public.control_runtime_sessions
WHERE game_id='cccccccc-4830-0000-0000-000000000001';
SELECT pg_temp.check_result((SELECT status='final' AND ended_at IS NOT NULL AND team_b_score=450
  AND team_a_score=100 AND rounds_score_b=300 AND stats_detail->>'end_reason'='final_complete'
  AND stats_detail->>'closed_by'='control_idle_expired'
  FROM public.game_sessions WHERE game_id='cccccccc-4830-0000-0000-000000000001'),
  'bezczynność na f_end zamyka grę jako zakończoną z doliczonym finałem');

-- Gra 2: przerwana w trakcie rundy — nadal porzucona.
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-4830-0000-0000-000000000002',1,'rounds','r_play','PLAY','A',
  '{"locks":{"gameStarted":true},"rounds":{"roundNo":2,"totals":{"A":50,"B":0}}}');
INSERT INTO public.control_runtime_sessions(game_id,owner_id,expires_at) VALUES
  ('cccccccc-4830-0000-0000-000000000002','aaaaaaaa-4830-0000-0000-000000000001',now()-interval '1 minute');
SELECT public.control_runtime_expire_one(id) FROM public.control_runtime_sessions
WHERE game_id='cccccccc-4830-0000-0000-000000000002';
SELECT pg_temp.check_result((SELECT status='abandoned' AND ended_at IS NOT NULL AND team_a_score=50
  AND stats_detail->>'end_reason'='control_idle_expired' AND NOT stats_detail ? 'closed_by'
  FROM public.game_sessions WHERE game_id='cccccccc-4830-0000-0000-000000000002'),
  'bezczynność w trakcie rundy: gra porzucona jak dotąd');

-- Gra 3: restart z f_end (nowy pusty stan) — finał A doliczony.
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-4830-0000-0000-000000000003',1,'final','f_end',NULL,NULL,
  '{"locks":{"gameStarted":true},"rounds":{"roundNo":5,"totals":{"A":320,"B":10}},"settings":{"finalTarget":200},"final":{"questions":[{"id":"q1"}],"winnerTeam":"A","runtime":{"sum":210,"reached200":true}}}');
UPDATE public.game_state SET rev=2, step='devices_display', top_card='devices', detail='{}'
WHERE game_id='cccccccc-4830-0000-0000-000000000003';
SELECT pg_temp.check_result((SELECT status='final' AND team_a_score=530 AND team_b_score=10
  AND stats_detail->>'end_reason'='final_target' AND stats_detail->>'closed_by'='restart'
  FROM public.game_sessions WHERE game_id='cccccccc-4830-0000-0000-000000000003'),
  'restart z f_end zamyka grę jako zakończoną');

-- Potwierdzenia: requested_at przy zmianie planszy, rendered_at przy nowym potwierdzeniu.
SELECT pg_temp.check_result((SELECT requested_rev=2 AND requested_at IS NOT NULL AND rendered_at IS NULL
  FROM public.game_state_display_completion WHERE game_id='cccccccc-4830-0000-0000-000000000003'),
  'żądanie zmiany planszy zapisuje czas serwera');
-- Atrapa walidacji urządzenia (tylko w tej transakcji).
CREATE OR REPLACE FUNCTION public._control_device_action_valid(p_game_id uuid,p_device_type text,p_key text,p_connection_id uuid,p_epoch bigint)
RETURNS boolean LANGUAGE sql AS 'SELECT true';
SELECT public.game_state_display_complete('cccccccc-4830-0000-0000-000000000003','k',2);
SELECT pg_temp.check_result((SELECT rendered_rev=2 AND rendered_at IS NOT NULL AND rendered_at>=requested_at
  FROM public.game_state_display_completion WHERE game_id='cccccccc-4830-0000-0000-000000000003'),
  'potwierdzenie planszy zapisuje czas serwera');
CREATE TEMP TABLE first_ack AS SELECT rendered_at FROM public.game_state_display_completion
  WHERE game_id='cccccccc-4830-0000-0000-000000000003';
SELECT public.game_state_display_complete('cccccccc-4830-0000-0000-000000000003','k',1);
SELECT pg_temp.check_result((SELECT c.rendered_rev=2 AND c.rendered_at=f.rendered_at
  FROM public.game_state_display_completion c, first_ack f WHERE c.game_id='cccccccc-4830-0000-0000-000000000003'),
  'starsze potwierdzenie nie przesuwa czasu');
ROLLBACK;

-- Poprawka wsteczna (sama w sobie): sesja zamknięta przed 483 jako porzucona na f_end.
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-4830-0000-0000-000000000009','old483@example.com');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-4830-0000-0000-000000000009','old483@example.com','old483');
INSERT INTO public.games(id,owner_id,name) VALUES ('cccccccc-4830-0000-0000-000000000009','aaaaaaaa-4830-0000-0000-000000000009','Old483');
INSERT INTO public.game_sessions(game_id,control_version,status,ended_at,winner_team,team_a_score,team_b_score,
  rounds_score_a,rounds_score_b,final_points,stats_detail)
VALUES ('cccccccc-4830-0000-0000-000000000009',2,'abandoned',now(),'B',218,574,218,574,196,
  '{"last_step":"f_end","end_reason":"control_idle_expired","target_reached":false}');
\i supabase/migrations/2026-10-24_483_control2_final_close_and_ack_timing.sql
SELECT pg_temp.check_result((SELECT status='final' AND team_b_score=770 AND team_a_score=218
  AND stats_detail->>'end_reason'='final_complete' AND stats_detail->>'closed_by'='control_idle_expired'
  FROM public.game_sessions WHERE game_id='cccccccc-4830-0000-0000-000000000009'),
  'poprawka wsteczna: porzucona na f_end staje się zakończoną z finałem');
\i supabase/migrations/2026-10-24_483_control2_final_close_and_ack_timing.sql
SELECT pg_temp.check_result((SELECT team_b_score=770 FROM public.game_sessions
  WHERE game_id='cccccccc-4830-0000-0000-000000000009'),
  'ponowne zastosowanie nie dolicza finału drugi raz');
ROLLBACK;
