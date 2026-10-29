-- Rollback-only test for migration 381: run after the schema and migration.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check(label text, condition boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', label; END IF;
  RAISE NOTICE 'ok: %', label;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('a3810000-0000-0000-0000-000000000001','settings381@example.invalid',now());
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('b3810000-0000-0000-0000-000000000001','a3810000-0000-0000-0000-000000000001','Guard381','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,expires_at) VALUES
 ('c3810000-0000-0000-0000-000000000001','b3810000-0000-0000-0000-000000000001','a3810000-0000-0000-0000-000000000001',now()+interval '10 minutes');
SELECT set_config('request.jwt.claim.sub','a3810000-0000-0000-0000-000000000001',true);

-- Entering active play creates the canonical game_session_active pointer.
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,detail)
VALUES ('b3810000-0000-0000-0000-000000000001',20,'rounds','r_play','PLAY',
  '{"locks":{"gameStarted":true,"gameEnded":false}}');
SELECT pg_temp.check('active game blocks settings and exposes expiry',
  (public.control_game_settings_status('b3810000-0000-0000-0000-000000000001')->>'in_progress')::boolean
  AND public.control_game_settings_status('b3810000-0000-0000-0000-000000000001') ? 'expires_at');

-- Cancellation ends the stats row, clears the canonical pointer and runtime,
-- resets game_state, and therefore invalidates the session-scoped device links.
SELECT pg_temp.check('cancel reports success',
  (public.control_game_cancel_for_settings('b3810000-0000-0000-0000-000000000001')->>'cancelled')::boolean);
SELECT pg_temp.check('cancel clears active pointer', NOT EXISTS (
  SELECT 1 FROM public.game_session_active WHERE game_id='b3810000-0000-0000-0000-000000000001'));
SELECT pg_temp.check('cancel marks gameplay abandoned with reason', EXISTS (
  SELECT 1 FROM public.game_sessions WHERE game_id='b3810000-0000-0000-0000-000000000001'
    AND ended_at IS NOT NULL AND status='abandoned'
    AND stats_detail->>'end_reason'='settings_cancelled'));
SELECT pg_temp.check('cancel resets Control state', EXISTS (
  SELECT 1 FROM public.game_state WHERE game_id='b3810000-0000-0000-0000-000000000001'
    AND step='devices_display' AND top_card='devices' AND detail='{}'::jsonb));
SELECT pg_temp.check('cancel invalidates runtime session', EXISTS (
  SELECT 1 FROM public.control_runtime_sessions WHERE id='c3810000-0000-0000-0000-000000000001'
    AND ended_at IS NOT NULL AND end_reason='settings_cancelled'));
SELECT pg_temp.check('settings are allowed after cancellation',
  NOT (public.control_game_settings_status('b3810000-0000-0000-0000-000000000001')->>'in_progress')::boolean);

-- A completed match no longer blocks settings even while its Control runtime
-- session remains alive for the end screen.
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('b3810000-0000-0000-0000-000000000002','a3810000-0000-0000-0000-000000000001','Completed381','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,expires_at) VALUES
 ('c3810000-0000-0000-0000-000000000002','b3810000-0000-0000-0000-000000000002','a3810000-0000-0000-0000-000000000001',now()+interval '10 minutes');
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,detail)
VALUES ('b3810000-0000-0000-0000-000000000002',30,'rounds','r_play','PLAY',
  '{"locks":{"gameStarted":true,"gameEnded":false}}');
UPDATE public.game_state SET step='r_gameEnd',detail='{"locks":{"gameStarted":true,"gameEnded":true}}'
WHERE game_id='b3810000-0000-0000-0000-000000000002';
SELECT pg_temp.check('completed gameplay does not block settings',
  NOT (public.control_game_settings_status('b3810000-0000-0000-0000-000000000002')->>'in_progress')::boolean);

-- If scheduled cleanup has not run yet, checking settings performs the same
-- idle-expiry cleanup before it grants access.
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('b3810000-0000-0000-0000-000000000003','a3810000-0000-0000-0000-000000000001','Expired381','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,expires_at) VALUES
 ('c3810000-0000-0000-0000-000000000003','b3810000-0000-0000-0000-000000000003','a3810000-0000-0000-0000-000000000001',now()-interval '1 second');
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,detail)
VALUES ('b3810000-0000-0000-0000-000000000003',40,'rounds','r_play','PLAY',
  '{"locks":{"gameStarted":true,"gameEnded":false}}');
SELECT public.control_game_settings_status('b3810000-0000-0000-0000-000000000003');
SELECT pg_temp.check('expired runtime is cleaned and settings are allowed',
  NOT EXISTS (SELECT 1 FROM public.game_session_active WHERE game_id='b3810000-0000-0000-0000-000000000003')
  AND EXISTS (SELECT 1 FROM public.control_runtime_sessions WHERE id='c3810000-0000-0000-0000-000000000003'
    AND end_reason='idle' AND ended_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM public.game_sessions WHERE game_id='b3810000-0000-0000-0000-000000000003'
    AND stats_detail->>'end_reason'='control_idle_expired'));

ROLLBACK;
