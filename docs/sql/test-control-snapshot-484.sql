-- Tylko izolowana baza po local-stubs + schema.sql + migracja 484.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
CREATE TEMP TABLE snap(label text PRIMARY KEY, payload jsonb);
GRANT SELECT, INSERT ON snap TO authenticated;
INSERT INTO auth.users(id,email) VALUES
  ('aaaaaaaa-4840-0000-0000-000000000001','owner484@example.com'),
  ('bbbbbbbb-4840-0000-0000-000000000002','other484@example.com');
INSERT INTO public.profiles(id,email,username) VALUES
  ('aaaaaaaa-4840-0000-0000-000000000001','owner484@example.com','owner484'),
  ('bbbbbbbb-4840-0000-0000-000000000002','other484@example.com','other484');
INSERT INTO public.games(id,owner_id,name) VALUES
  ('cccccccc-4840-0000-0000-000000000003','aaaaaaaa-4840-0000-0000-000000000001','Snap484');
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-4840-0000-0000-000000000003',7,'rounds','r_duel',NULL,NULL,'{"locks":{"gameStarted":true}}');
UPDATE public.game_state SET rev=8, step='r_play', phase='PLAY' WHERE game_id='cccccccc-4840-0000-0000-000000000003';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-4840-0000-0000-000000000001',true);
INSERT INTO snap SELECT 'owner', public.control_devices_snapshot('cccccccc-4840-0000-0000-000000000003');
RESET ROLE;
SELECT pg_temp.check_result((SELECT payload->>'ok'='true' AND (payload->>'game_rev')::int=8
  AND (payload->'display_completion'->>'requested_rev')::int=8
  AND payload->'display_completion'->>'requested_at' IS NOT NULL
  AND payload ? 'devices' FROM snap WHERE label='owner'),
  'migawka właściciela ma rewizję gry i żądanie potwierdzenia');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-4840-0000-0000-000000000002',true);
DO $$ BEGIN
  PERFORM public.control_devices_snapshot('cccccccc-4840-0000-0000-000000000003');
  RAISE EXCEPTION 'FAIL: obcy dostał migawkę';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  RAISE NOTICE 'PASS: obcy użytkownik dalej dostaje forbidden';
END $$;
RESET ROLE;
ROLLBACK;
