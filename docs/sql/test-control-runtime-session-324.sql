-- Tylko izolowana baza po local-stubs + schema.sql + migracja 324.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
CREATE TEMP TABLE runtime_test_results(label text PRIMARY KEY, payload jsonb);
GRANT SELECT, INSERT ON runtime_test_results TO authenticated;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce,description)
VALUES('device:share','pair',3600,true,'E19 324 fixture') ON CONFLICT(action_key) DO NOTHING;

INSERT INTO auth.users(id,email) VALUES
  ('aaaaaaaa-3240-0000-0000-000000000001','owner324@example.com'),
  ('bbbbbbbb-3240-0000-0000-000000000002','other324@example.com');
INSERT INTO public.user_flags(user_id,email_notifications)
VALUES('bbbbbbbb-3240-0000-0000-000000000002',false);
INSERT INTO public.profiles(id,email,username) VALUES
  ('aaaaaaaa-3240-0000-0000-000000000001','owner324@example.com','owner324'),
  ('bbbbbbbb-3240-0000-0000-000000000002','other324@example.com','other324');
INSERT INTO public.games(id,owner_id,name) VALUES
  ('cccccccc-3240-0000-0000-000000000003','aaaaaaaa-3240-0000-0000-000000000001','Runtime324');
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-3240-0000-0000-000000000003',9,'rounds','r_play','PLAY','A',
  '{"locks":{"gameStarted":true},"rounds":{"roundNo":2}}');
INSERT INTO public.device_connect_codes(code,owner_id,game_id,game_name,device_type,share_key)
VALUES ('324001','aaaaaaaa-3240-0000-0000-000000000001','cccccccc-3240-0000-0000-000000000003','Runtime324','display','legacy-key');
INSERT INTO public.device_presence(game_id,device_type,device_id)
VALUES ('cccccccc-3240-0000-0000-000000000003','display','display324');
INSERT INTO public.display_audio_unlock(game_id,session_nonce,request_nonce)
VALUES ('cccccccc-3240-0000-0000-000000000003','session324','request324');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3240-0000-0000-000000000001',true);
INSERT INTO runtime_test_results SELECT 'start',public.control_runtime_session_touch(
  'cccccccc-3240-0000-0000-000000000003',NULL);
RESET ROLE;
SELECT pg_temp.check_result((SELECT payload->>'ok'='true' AND payload->>'expired'='false' FROM runtime_test_results WHERE label='start'),
  'owner starts a fresh runtime session');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3240-0000-0000-000000000001',true);
INSERT INTO runtime_test_results SELECT 'pair_link',public.control_runtime_device_link(
  'cccccccc-3240-0000-0000-000000000003','display');
INSERT INTO runtime_test_results SELECT 'buzzer_link',public.control_runtime_device_link(
  'cccccccc-3240-0000-0000-000000000003','buzzer');
INSERT INTO runtime_test_results SELECT 'preflight',public.control_device_share_preflight(
  'cccccccc-3240-0000-0000-000000000003','host','bbbbbbbb-3240-0000-0000-000000000002',NULL);
INSERT INTO runtime_test_results SELECT 'friend_share',public.control_device_share_create(
  'cccccccc-3240-0000-0000-000000000003','host','bbbbbbbb-3240-0000-0000-000000000002',NULL);
INSERT INTO runtime_test_results
SELECT 'owner_share_list',to_jsonb(s) FROM public.control_device_shares_list(
  'cccccccc-3240-0000-0000-000000000003','host') s
WHERE s.share_id=(SELECT (payload->>'share_id')::uuid FROM runtime_test_results WHERE label='friend_share');
RESET ROLE;
SELECT pg_temp.check_result((SELECT payload->>'ok'='true' AND payload->>'token' IS NOT NULL
  FROM runtime_test_results WHERE label='pair_link'),
  'owner creates a device link token bound to the active Control session');
SELECT pg_temp.check_result(public.control_device_key_valid('cccccccc-3240-0000-0000-000000000003','display',
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='pair_link')),
  'active pairing token authorizes its device type');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3240-0000-0000-000000000001',true);
INSERT INTO runtime_test_results SELECT 'device_ping',public.device_ping(
  'cccccccc-3240-0000-0000-000000000003','display'::public.device_type,
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='pair_link'),'device324','{}');
INSERT INTO runtime_test_results SELECT 'state_read',to_jsonb(public.game_state_get(
  'cccccccc-3240-0000-0000-000000000003','display'::public.device_type,
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='pair_link')));
INSERT INTO runtime_test_results SELECT 'display_auth',to_jsonb(d) FROM public.display_auth(
  'cccccccc-3240-0000-0000-000000000003',
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='pair_link')) d;
SELECT public.game_state_display_complete('cccccccc-3240-0000-0000-000000000003',
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='pair_link'),9);
INSERT INTO runtime_test_results SELECT 'display_ready',jsonb_build_object(
  'display',public.game_state_display_is_ready('cccccccc-3240-0000-0000-000000000003',
    (SELECT payload->>'token' FROM runtime_test_results WHERE label='pair_link')),
  'buzzer',public.game_state_display_is_ready('cccccccc-3240-0000-0000-000000000003',
    (SELECT payload->>'token' FROM runtime_test_results WHERE label='buzzer_link')));
RESET ROLE;
SELECT pg_temp.check_result((SELECT payload->>'ok'='true' FROM runtime_test_results WHERE label='device_ping')
  AND (SELECT payload->>'game_id'='cccccccc-3240-0000-0000-000000000003' FROM runtime_test_results WHERE label='state_read')
  AND (SELECT payload->>'id'='cccccccc-3240-0000-0000-000000000003' FROM runtime_test_results WHERE label='display_auth')
  AND (SELECT payload->>'display'='true' AND payload->>'buzzer'='true' FROM runtime_test_results WHERE label='display_ready'),
  'device ping, state read, Display authentication/completion, and Buzzer readiness accept session tokens');
SELECT pg_temp.check_result((SELECT payload->>'ok'='true' AND payload->>'created'='true'
  FROM runtime_test_results WHERE label='friend_share'),
  'owner creates an individual recipient share');
SELECT pg_temp.check_result((SELECT payload->>'mail_disabled'='true' AND payload->>'mail_allowed'='false'
  FROM runtime_test_results WHERE label='friend_share')
  AND NOT EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='device:share'),
  'disabled recipient notifications skip cooldown reservation before queueing');
SELECT pg_temp.check_result((SELECT payload->>'already_shared'='false' AND payload->>'mail_disabled'='true'
  FROM runtime_test_results WHERE label='preflight'),
  'preflight reports an available grant and disabled notification setting');
SELECT pg_temp.check_result((SELECT payload->>'recipient_kind'='account' AND payload->>'recipient_username'='other324'
  FROM runtime_test_results WHERE label='owner_share_list'),
  'owner list exposes account identity and kind for the current session');
SELECT pg_temp.check_result(public.control_device_key_valid('cccccccc-3240-0000-0000-000000000003','host',
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='friend_share')),
  'active recipient token authorizes the shared device');
INSERT INTO runtime_test_results SELECT 'resolve_active',public.control_device_share_resolve(
  (SELECT (payload->>'token')::uuid FROM runtime_test_results WHERE label='friend_share'));
SELECT pg_temp.check_result((SELECT payload->>'state'='active' AND payload->>'device_type'='host'
  FROM runtime_test_results WHERE label='resolve_active'),
  'the gateway resolves an active recipient link');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3240-0000-0000-000000000002',true);
INSERT INTO runtime_test_results
SELECT 'recipient_list',jsonb_build_object('share_id',share_id,'share_key',share_key)
FROM public.list_shared_devices_for_me()
WHERE share_id=(SELECT (payload->>'share_id')::uuid FROM runtime_test_results WHERE label='friend_share');
RESET ROLE;
SELECT pg_temp.check_result((SELECT payload->>'share_id'=(SELECT payload->>'share_id' FROM runtime_test_results WHERE label='friend_share')
  AND payload->>'share_key'=(SELECT payload->>'token' FROM runtime_test_results WHERE label='friend_share')
  FROM runtime_test_results WHERE label='recipient_list'),
  'recipient account can discover its session share in Connect without relying on mail');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3240-0000-0000-000000000001',true);
SELECT public.control_device_share_revoke((SELECT (payload->>'share_id')::uuid
  FROM runtime_test_results WHERE label='friend_share'));
RESET ROLE;
SELECT pg_temp.check_result(NOT public.control_device_key_valid('cccccccc-3240-0000-0000-000000000003','host',
  (SELECT payload->>'token' FROM runtime_test_results WHERE label='friend_share')),
  'revoking a single share immediately invalidates its token');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3240-0000-0000-000000000001',true);
INSERT INTO runtime_test_results SELECT 'renew',public.control_runtime_session_touch(
  'cccccccc-3240-0000-0000-000000000003',(SELECT (payload->>'session_id')::uuid FROM runtime_test_results WHERE label='start'));
RESET ROLE;
SELECT pg_temp.check_result((SELECT payload->>'session_id'=(SELECT payload->>'session_id' FROM runtime_test_results WHERE label='start')
  AND (payload->>'expires_at')::timestamptz > now() FROM runtime_test_results WHERE label='renew'),
  'activity renews the same runtime session by one hour');

UPDATE public.control_runtime_sessions
SET expires_at=now()-interval '1 second'
WHERE id=(SELECT (payload->>'session_id')::uuid FROM runtime_test_results WHERE label='start');
INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_email,device_type)
SELECT (payload->>'session_id')::uuid,'cccccccc-3240-0000-0000-000000000003',
  'aaaaaaaa-3240-0000-0000-000000000001','recipient324@example.com','display'
FROM runtime_test_results WHERE label='start';
INSERT INTO public.shared_devices(owner_id,recipient_id,device_type,game_id,game_name)
VALUES('aaaaaaaa-3240-0000-0000-000000000001','bbbbbbbb-3240-0000-0000-000000000002',
  'host','cccccccc-3240-0000-0000-000000000003','Runtime324');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3240-0000-0000-000000000001',true);
INSERT INTO runtime_test_results SELECT 'expired',public.control_runtime_session_touch(
  'cccccccc-3240-0000-0000-000000000003',(SELECT (payload->>'session_id')::uuid FROM runtime_test_results WHERE label='start'));
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3240-0000-0000-000000000002',true);
INSERT INTO runtime_test_results SELECT 'forbidden',public.control_runtime_session_touch(
  'cccccccc-3240-0000-0000-000000000003',NULL);
RESET ROLE;

SELECT pg_temp.check_result((SELECT payload->>'expired'='true' AND payload->>'session_id'<>
  (SELECT payload->>'session_id' FROM runtime_test_results WHERE label='start') FROM runtime_test_results WHERE label='expired'),
  'expired session is replaced with a new session id');
SELECT pg_temp.check_result((SELECT payload->>'error'='forbidden' FROM runtime_test_results WHERE label='forbidden'),
  'another account cannot touch the runtime session');
SELECT pg_temp.check_result((SELECT step='devices_display' AND top_card='devices' AND detail='{}'::jsonb AND rev=10
  FROM public.game_state WHERE game_id='cccccccc-3240-0000-0000-000000000003'),
  'expiry resets persistent Control state to device pairing');
SELECT pg_temp.check_result((SELECT status='abandoned' AND ended_at IS NOT NULL AND stats_detail->>'end_reason'='control_idle_expired'
  FROM public.game_sessions WHERE game_id='cccccccc-3240-0000-0000-000000000003' AND control_version=2),
  'expiry closes the active gameplay telemetry row');
SELECT pg_temp.check_result(NOT EXISTS(SELECT 1 FROM public.game_session_active WHERE game_id='cccccccc-3240-0000-0000-000000000003')
  AND NOT EXISTS(SELECT 1 FROM public.device_connect_codes WHERE game_id='cccccccc-3240-0000-0000-000000000003')
  AND NOT EXISTS(SELECT 1 FROM public.device_presence WHERE game_id='cccccccc-3240-0000-0000-000000000003')
  AND NOT EXISTS(SELECT 1 FROM public.display_audio_unlock WHERE game_id='cccccccc-3240-0000-0000-000000000003')
  AND NOT EXISTS(SELECT 1 FROM public.shared_devices WHERE game_id='cccccccc-3240-0000-0000-000000000003'),
  'expiry clears the active pointer and temporary pairing/presence state');
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.control_device_shares
  WHERE game_id='cccccccc-3240-0000-0000-000000000003' AND revoked_at IS NULL)
  AND (SELECT count(*)=2 FROM public.control_device_link_tokens
    WHERE game_id='cccccccc-3240-0000-0000-000000000003'),
  'expiry retains share/token tombstones for an explicit expired-link response');
SELECT pg_temp.check_result((SELECT NOT public.control_device_key_valid(
  'cccccccc-3240-0000-0000-000000000003','display',token::text)
  FROM public.control_device_shares WHERE game_id='cccccccc-3240-0000-0000-000000000003'
    AND recipient_email IS NOT NULL),
  'a token from an expired session no longer authorizes device access');
SELECT pg_temp.check_result(NOT public.control_device_key_valid(
  'cccccccc-3240-0000-0000-000000000003','host','legacy-key'),
  'legacy game-wide keys are not accepted by the new device authorization gate');
INSERT INTO runtime_test_results
SELECT 'expired_link',public.control_device_share_resolve(token)
FROM public.control_device_shares WHERE game_id='cccccccc-3240-0000-0000-000000000003'
  AND recipient_email IS NOT NULL;
SELECT pg_temp.check_result((SELECT payload->>'state'='expired' FROM runtime_test_results WHERE label='expired_link'),
  'an expired link resolves to a stable expired state');
ROLLBACK;
