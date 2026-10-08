\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
  $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.games(id uuid PRIMARY KEY,owner_id uuid,share_key_display text);
INSERT INTO games VALUES(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'display-key'
);
\ir ../../supabase/migrations/2026-10-08_312_display_audio_unlock_atomic.sql
\ir ../../supabase/migrations/2026-10-08_314_display_audio_unlock_session_nonce.sql
CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion: %',message; END IF; END $$;

SET ROLE anon;
SELECT begin_display_audio_session(
  '00000000-0000-0000-0000-000000000001','display-key','session-0001'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000002',false);
SELECT request_display_audio_unlock(
  '00000000-0000-0000-0000-000000000001','request-0001'
);
SELECT pg_temp.assert_true((SELECT session_nonce='session-0001'
  AND request_nonce='request-0001' AND acknowledged_nonce IS NULL
  FROM display_audio_unlock),'owner request preserves active Display session');
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.assert_true(acknowledge_display_audio_unlock(
  '00000000-0000-0000-0000-000000000001','display-key','request-0001'
),'Display acknowledges the active request');
SELECT begin_display_audio_session(
  '00000000-0000-0000-0000-000000000001','display-key','session-0002'
);
SELECT pg_temp.assert_true(NOT acknowledge_display_audio_unlock(
  '00000000-0000-0000-0000-000000000001','display-key','request-0001'
),'old session request cannot acknowledge a new session');
RESET ROLE;

SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT session_nonce='session-0002'
  AND acknowledged_nonce IS NULL FROM display_audio_unlock),
  'new Display session clears the previous acknowledgment');
RESET ROLE;
\echo 'Display audio unlock session and request nonce checks passed'
