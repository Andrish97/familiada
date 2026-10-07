-- Canonical page paths now serve the current Control, Display, Host, Buzzer,
-- and Game Settings. Remove only the retired snapshot table and legacy session
-- writer RPCs. Keep game_sessions and every historical row: Control's current
-- statistics read that table and preserve records from both generations.
BEGIN;

DO $$
DECLARE unexpected text;
BEGIN
 SELECT string_agg(p.oid::regprocedure::text, ', ') INTO unexpected
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p')
 AND p.prosrc ~ '\m(device_state|device_kind|ensure_device_state|game_session_start|game_session_update|game_session_end)\M'
 AND p.proname NOT IN ('device_state_get','device_state_set_public','device_state_set_admin',
 'ensure_device_state','game_session_start','game_session_update','game_session_end');
 IF unexpected IS NOT NULL THEN
   RAISE EXCEPTION 'Unexpected legacy Control dependencies: %', unexpected;
 END IF;
END $$;

-- Legacy Control 1 session writer. Migration 226 replaced the old 3-argument
-- overload with longer forms; drop all historical exact signatures.
DROP FUNCTION IF EXISTS public.game_session_start(uuid, jsonb);
DROP FUNCTION IF EXISTS public.game_session_update(uuid, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.game_session_end(uuid, text, text);
DROP FUNCTION IF EXISTS public.game_session_end(uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.game_session_end(uuid, text, text, text, integer, integer, integer, integer, integer);

-- Snapshot state used only by the retired Display/Host/Buzzer clients.
-- No CASCADE: unexpected live dependencies abort and roll back this migration.
DROP FUNCTION IF EXISTS public.device_state_get(uuid, public.device_type, text);
DROP FUNCTION IF EXISTS public.device_state_set_public(uuid, public.device_type, text, jsonb);
DROP FUNCTION IF EXISTS public.device_state_set_admin(uuid, public.device_kind, jsonb);
DROP FUNCTION IF EXISTS public.ensure_device_state(uuid);
DROP TABLE IF EXISTS public.device_state;
DROP TYPE IF EXISTS public.device_kind;

NOTIFY pgrst, 'reload schema';
COMMIT;
