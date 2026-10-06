\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.games(id uuid PRIMARY KEY, owner_id uuid, share_key_display text);
CREATE TABLE public.game_state(game_id uuid PRIMARY KEY REFERENCES games(id), rev bigint, step text, phase text, sound_cue_key text);
\ir ../../supabase/migrations/2026-10-06_305_display_render_completion.sql
INSERT INTO games VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','display-key');
INSERT INTO game_state VALUES('00000000-0000-0000-0000-000000000001',5,'f_p1_map_q1',NULL,'answer_correct');
DO $$ BEGIN
 BEGIN
  UPDATE game_state SET step='f_end',rev=6;
  RAISE EXCEPTION 'An unfinished sum allowed final completion';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'display still rendering' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM game_state_display_complete('00000000-0000-0000-0000-000000000001','wrong-key',5);
  RAISE EXCEPTION 'Wrong key was accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
 END;
END $$;
SELECT game_state_display_complete('00000000-0000-0000-0000-000000000001','display-key',5);
SELECT game_state_display_complete('00000000-0000-0000-0000-000000000001','display-key',4);
UPDATE game_state SET step='f_end',rev=6;
UPDATE game_state SET step='r_play',rev=7,sound_cue_key='reveal';
DO $$ BEGIN
 BEGIN
  UPDATE game_state SET step='r_gameEnd',rev=8;
  RAISE EXCEPTION 'An unfinished round score allowed game completion';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'display still rendering' THEN RAISE; END IF;
 END;
END $$;
SELECT game_state_display_complete('00000000-0000-0000-0000-000000000001','display-key',7);
UPDATE game_state SET step='r_gameEnd',rev=8;
DELETE FROM game_state;
DO $$ BEGIN
 IF EXISTS(SELECT FROM game_state_display_completion) THEN RAISE EXCEPTION 'Stale acknowledgment survived deleted state'; END IF;
END $$;
\echo 'Final and round completion guards, device key and revision handling passed'
