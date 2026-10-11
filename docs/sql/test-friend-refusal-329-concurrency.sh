#!/usr/bin/env bash
# Wyłącznie izolowany Postgres; tymczasowe dane przykładowe, bez kolejki mailowej.
set -euo pipefail
TASK329_TMP=$(mktemp -d)
cleanup() {
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.mail_cooldowns WHERE target_key IN ('pair:aaaaaaaa-3298-0000-0000-000000000001:bbbbbbbb-3298-0000-0000-000000000002','pair:bbbbbbbb-3298-0000-0000-000000000002:aaaaaaaa-3298-0000-0000-000000000001');
DELETE FROM public.profiles WHERE id IN ('aaaaaaaa-3298-0000-0000-000000000001','bbbbbbbb-3298-0000-0000-000000000002');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3298-0000-0000-000000000001','bbbbbbbb-3298-0000-0000-000000000002');
SQL
  rm -rf "$TASK329_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('friend:invite','pair',432000,true),('friend:resend','pair',432000,true) ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3298-0000-0000-000000000001','race-a329@example.net'),
 ('bbbbbbbb-3298-0000-0000-000000000002','race-b329@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3298-0000-0000-000000000001','race-a329@example.net','racea329'),
 ('bbbbbbbb-3298-0000-0000-000000000002','race-b329@example.net','raceb329')
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.friendships(id,token,requester_id,addressee_id,status,declined_at,email_sent_at,email_send_count)
VALUES('ffffffff-3298-0000-0000-000000000001','ffffffff-3298-0000-0000-000000000002',
 'aaaaaaaa-3298-0000-0000-000000000001','bbbbbbbb-3298-0000-0000-000000000002','pending',now(),now()-interval '6 days',0);
SQL
remind() {
  psql -qAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL "request.jwt.claim.sub"='aaaaaaaa-3298-0000-0000-000000000001';
SELECT public.friends_resend('ffffffff-3298-0000-0000-000000000001');
SELECT pg_sleep(0.6);
COMMIT;
SQL
}
remind > "$TASK329_TMP/a" & TASK329_A=$!
remind > "$TASK329_TMP/b" & TASK329_B=$!
wait "$TASK329_A"
wait "$TASK329_B"
TASK329_RESULT_A=$(cat "$TASK329_TMP/a")
TASK329_RESULT_B=$(cat "$TASK329_TMP/b")
TASK329_ALLOWED=0; TASK329_BLOCKED=0
for TASK329_RESULT in "$TASK329_RESULT_A" "$TASK329_RESULT_B"; do
  if [[ "$TASK329_RESULT" == *'"ok": true'* ]]; then TASK329_ALLOWED=$((TASK329_ALLOWED+1)); fi
  if [[ "$TASK329_RESULT" == *'"err": "cooldown"'* ]]; then TASK329_BLOCKED=$((TASK329_BLOCKED+1)); fi
done
[[ "$TASK329_ALLOWED" == 1 && "$TASK329_BLOCKED" == 1 ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id='ffffffff-3298-0000-0000-000000000001'
   AND email_send_count=1 AND status='pending' AND token='ffffffff-3298-0000-0000-000000000002') THEN
   RAISE EXCEPTION 'concurrent reminders changed counter/status/token'; END IF;
 RAISE NOTICE '329 concurrency OK: one reminder, one cooldown, count=1, status/token preserved';
END $$;
SQL
# Opposite invitations must serialize into one pending request, never autoaccept.
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.friendships WHERE id='ffffffff-3298-0000-0000-000000000001';
DELETE FROM public.mail_cooldowns WHERE target_key IN
 ('pair:aaaaaaaa-3298-0000-0000-000000000001:bbbbbbbb-3298-0000-0000-000000000002',
  'pair:bbbbbbbb-3298-0000-0000-000000000002:aaaaaaaa-3298-0000-0000-000000000001');
SQL
invite_a() {
 psql -qAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL "request.jwt.claim.sub"='aaaaaaaa-3298-0000-0000-000000000001';
SELECT public.friends_invite('raceb329');
SELECT pg_sleep(0.6);
COMMIT;
SQL
}
invite_b() {
 psql -qAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL "request.jwt.claim.sub"='bbbbbbbb-3298-0000-0000-000000000002';
SELECT public.friends_invite('racea329');
SELECT pg_sleep(0.6);
COMMIT;
SQL
}
invite_a > "$TASK329_TMP/a" & TASK329_A=$!
invite_b > "$TASK329_TMP/b" & TASK329_B=$!
wait "$TASK329_A"
wait "$TASK329_B"
TASK329_ALLOWED=0; TASK329_BLOCKED=0
for TASK329_PATH in "$TASK329_TMP/a" "$TASK329_TMP/b"; do
 TASK329_RESULT=$(cat "$TASK329_PATH")
 if [[ "$TASK329_RESULT" == *'"ok": true'* ]]; then TASK329_ALLOWED=$((TASK329_ALLOWED+1)); fi
 if [[ "$TASK329_RESULT" == *'"err": "already"'* && "$TASK329_RESULT" == *'"direction": "incoming"'* ]]; then TASK329_BLOCKED=$((TASK329_BLOCKED+1)); fi
done
[[ "$TASK329_ALLOWED" == 1 && "$TASK329_BLOCKED" == 1 ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.friendships WHERE requester_id IN ('aaaaaaaa-3298-0000-0000-000000000001','bbbbbbbb-3298-0000-0000-000000000002'))<>1 OR
 NOT EXISTS(SELECT 1 FROM public.friendships WHERE requester_id IN ('aaaaaaaa-3298-0000-0000-000000000001','bbbbbbbb-3298-0000-0000-000000000002') AND status='pending' AND email_send_count=1) THEN
  RAISE EXCEPTION 'opposite invitations duplicated or autoaccepted'; END IF;
 RAISE NOTICE '329 concurrency OK: opposite invitations yield one pending row and an explicit incoming-request response';
END $$;
SQL
