#!/usr/bin/env bash
# Wyłącznie izolowany Postgres; tymczasowe dane przykładowe, bez kolejki mailowej.
set -euo pipefail
TASK328_TMP=$(mktemp -d)
cleanup() {
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.mail_cooldowns WHERE target_key='pair:aaaaaaaa-3288-0000-0000-000000000001:bbbbbbbb-3288-0000-0000-000000000002';
DELETE FROM public.profiles WHERE id IN ('aaaaaaaa-3288-0000-0000-000000000001','bbbbbbbb-3288-0000-0000-000000000002');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3288-0000-0000-000000000001','bbbbbbbb-3288-0000-0000-000000000002');
SQL
  rm -rf "$TASK328_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('friend:invite','pair',432000,true),('friend:resend','pair',432000,true) ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3288-0000-0000-000000000001','race-a328@example.net'),
 ('bbbbbbbb-3288-0000-0000-000000000002','race-b328@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3288-0000-0000-000000000001','race-a328@example.net','racea328'),
 ('bbbbbbbb-3288-0000-0000-000000000002','race-b328@example.net','raceb328')
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.friendships(id,token,requester_id,addressee_id,status,declined_at,email_sent_at,email_send_count)
VALUES('ffffffff-3288-0000-0000-000000000001','ffffffff-3288-0000-0000-000000000002',
 'aaaaaaaa-3288-0000-0000-000000000001','bbbbbbbb-3288-0000-0000-000000000002','declined',now(),now()-interval '6 days',0);
SQL
remind() {
  psql -qAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL "request.jwt.claim.sub"='aaaaaaaa-3288-0000-0000-000000000001';
SELECT public.friends_resend('ffffffff-3288-0000-0000-000000000001');
SELECT pg_sleep(0.6);
COMMIT;
SQL
}
remind > "$TASK328_TMP/a" & TASK328_A=$!
remind > "$TASK328_TMP/b" & TASK328_B=$!
wait "$TASK328_A"
wait "$TASK328_B"
TASK328_RESULT_A=$(cat "$TASK328_TMP/a")
TASK328_RESULT_B=$(cat "$TASK328_TMP/b")
TASK328_ALLOWED=0; TASK328_BLOCKED=0
for TASK328_RESULT in "$TASK328_RESULT_A" "$TASK328_RESULT_B"; do
  if [[ "$TASK328_RESULT" == *'"ok": true'* ]]; then TASK328_ALLOWED=$((TASK328_ALLOWED+1)); fi
  if [[ "$TASK328_RESULT" == *'"err": "cooldown"'* ]]; then TASK328_BLOCKED=$((TASK328_BLOCKED+1)); fi
done
[[ "$TASK328_ALLOWED" == 1 && "$TASK328_BLOCKED" == 1 ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id='ffffffff-3288-0000-0000-000000000001'
   AND email_send_count=1 AND status='declined' AND token='ffffffff-3288-0000-0000-000000000002') THEN
   RAISE EXCEPTION 'concurrent reminders changed counter/status/token'; END IF;
 RAISE NOTICE '328 concurrency OK: one reminder, one cooldown, count=1, status/token preserved';
END $$;
SQL
