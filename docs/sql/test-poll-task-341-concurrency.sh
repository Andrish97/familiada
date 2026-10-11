#!/usr/bin/env bash
set -euo pipefail
POLL341_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.games WHERE id='dddddddd-3418-0000-0000-000000000004';
DELETE FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3418-0000-0000-000000000001:%';
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3418-0000-0000-000000000001','bbbbbbbb-3418-0000-0000-000000000002');
SQL
 rm -rf "$POLL341_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3418-0000-0000-000000000001','raceowner341@example.net'),('bbbbbbbb-3418-0000-0000-000000000002','racerecipient341@example.net');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3418-0000-0000-000000000001','raceowner341@example.net','raceowner341'),('bbbbbbbb-3418-0000-0000-000000000002','racerecipient341@example.net','racerecipient341') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.user_flags(user_id,email_notifications) VALUES('bbbbbbbb-3418-0000-0000-000000000002',false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES('aaaaaaaa-3418-0000-0000-000000000001','bbbbbbbb-3418-0000-0000-000000000002','active');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('dddddddd-3418-0000-0000-000000000004','aaaaaaaa-3418-0000-0000-000000000001','Race341','poll_text','poll_open','race341');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$POLL341_TMP/first" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3418-0000-0000-000000000001',true);
SELECT public.poll_share_send('dddddddd-3418-0000-0000-000000000004',ARRAY['bbbbbbbb-3418-0000-0000-000000000002'::uuid],'{}');
\! touch '$POLL341_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
POLL341_PID=$!
for POLL341_TRY in {1..100}; do [[ -f "$POLL341_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$POLL341_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3418-0000-0000-000000000001',true);
DO $$ DECLARE j jsonb; BEGIN
 j:=public.poll_share_send('dddddddd-3418-0000-0000-000000000004',ARRAY['bbbbbbbb-3418-0000-0000-000000000002'::uuid],'{}');
 IF j->>'created' IS DISTINCT FROM '0' OR j->>'kept' IS DISTINCT FROM '1'
 OR (SELECT count(*) FROM public.poll_tasks WHERE game_id='dddddddd-3418-0000-0000-000000000004')<>1 THEN RAISE EXCEPTION 'duplicate race %',j; END IF;
END $$;
COMMIT;
SQL
wait "$POLL341_PID"
rm -f "$POLL341_TMP/locked"
psql -qAt -v ON_ERROR_STOP=1 > "$POLL341_TMP/decline" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3418-0000-0000-000000000002',true);
SELECT public.poll_task_decline((SELECT token FROM public.poll_tasks WHERE game_id='dddddddd-3418-0000-0000-000000000004'));
\! touch '$POLL341_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
POLL341_PID=$!
for POLL341_TRY in {1..100}; do [[ -f "$POLL341_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$POLL341_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3418-0000-0000-000000000001',true);
DO $$ DECLARE tid uuid; j jsonb; BEGIN
 SELECT id INTO tid FROM public.poll_tasks WHERE game_id='dddddddd-3418-0000-0000-000000000004';
 j:=public.poll_share_remind('dddddddd-3418-0000-0000-000000000004',tid);
 IF j->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'reminder races refusal %',j; END IF;
 PERFORM public.poll_share_remove('dddddddd-3418-0000-0000-000000000004',tid);
 j:=public.poll_share_send('dddddddd-3418-0000-0000-000000000004',ARRAY['bbbbbbbb-3418-0000-0000-000000000002'::uuid],'{}');
 IF j->>'created' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'remove/resend refusal race %',j; END IF;
END $$;
COMMIT;
SQL
wait "$POLL341_PID"
rm -f "$POLL341_TMP/locked"
psql -qAt -v ON_ERROR_STOP=1 > "$POLL341_TMP/deletion" <<SQL &
BEGIN;
SELECT id FROM public.games WHERE id='dddddddd-3418-0000-0000-000000000004' FOR UPDATE;
\! touch '$POLL341_TMP/locked'
SELECT pg_sleep(2);
DELETE FROM public.games WHERE id='dddddddd-3418-0000-0000-000000000004';
COMMIT;
SQL
POLL341_PID=$!
for POLL341_TRY in {1..100}; do [[ -f "$POLL341_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$POLL341_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3418-0000-0000-000000000002',true);
DO $$ DECLARE tok uuid; result text; BEGIN
 SELECT token INTO tok FROM public.poll_tasks WHERE game_id='dddddddd-3418-0000-0000-000000000004';
 result:=public.poll_task_opened(tok);
 IF result NOT IN ('expired','not_found') OR result IS NULL THEN RAISE EXCEPTION 'deleted parent decision %',result; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id='dddddddd-3418-0000-0000-000000000004') THEN RAISE EXCEPTION 'missing cascade'; END IF;
END $$;
COMMIT;
SQL
wait "$POLL341_PID"
echo '341 concurrency OK: single task, refusal beats reminder/removal, parent deletion blocks decision'
