#!/usr/bin/env bash
# Isolated database only. No SMTP or real accounts.
set -euo pipefail
FRIEND346_TMP=$(mktemp -d)
cleanup() {
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.mail_cooldowns WHERE target_key IN ('pair:aaaaaaaa-3468-0000-0000-000000000001:bbbbbbbb-3468-0000-0000-000000000002','pair:bbbbbbbb-3468-0000-0000-000000000002:aaaaaaaa-3468-0000-0000-000000000001');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3468-0000-0000-000000000001','bbbbbbbb-3468-0000-0000-000000000002');
SQL
  rm -rf "$FRIEND346_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('friend:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3468-0000-0000-000000000001','a346race@example.invalid'),('bbbbbbbb-3468-0000-0000-000000000002','b346race@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-3468-0000-0000-000000000001','a346race@example.invalid','racea346'),('bbbbbbbb-3468-0000-0000-000000000002','b346race@example.invalid','raceb346') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.friendships(id,requester_id,addressee_id,status,email_send_count,email_sent_at) VALUES ('ffffffff-3468-0000-0000-000000000003','aaaaaaaa-3468-0000-0000-000000000001','bbbbbbbb-3468-0000-0000-000000000002','active',1,now());
SQL
call_actor() {
  local friend346_actor=$1 friend346_operation=$2
  psql -qAt -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL "request.jwt.claim.sub"='$friend346_actor';
SELECT public.$friend346_operation('ffffffff-3468-0000-0000-000000000003');
COMMIT;
SQL
}
call_actor aaaaaaaa-3468-0000-0000-000000000001 friends_remove > "$FRIEND346_TMP/a" & FRIEND346_A=$!
call_actor bbbbbbbb-3468-0000-0000-000000000002 friends_remove > "$FRIEND346_TMP/b" & FRIEND346_B=$!
wait "$FRIEND346_A"
wait "$FRIEND346_B"
FRIEND346_ALLOWED=0; FRIEND346_BLOCKED=0
for FRIEND346_FILE in "$FRIEND346_TMP/a" "$FRIEND346_TMP/b"; do
 FRIEND346_RESULT=$(cat "$FRIEND346_FILE")
 if [[ "$FRIEND346_RESULT" == *'"ok": true'* ]]; then FRIEND346_ALLOWED=$((FRIEND346_ALLOWED+1)); fi
 if [[ "$FRIEND346_RESULT" == *'"err": "not_found"'* ]]; then FRIEND346_BLOCKED=$((FRIEND346_BLOCKED+1)); fi
done
[[ "$FRIEND346_ALLOWED" == 1 && "$FRIEND346_BLOCKED" == 1 ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id='ffffffff-3468-0000-0000-000000000003' AND status='declined' AND email_send_count=1 AND cancelled_at IS NULL AND declined_at IS NOT NULL) THEN RAISE EXCEPTION 'concurrent withdrawals lost state'; END IF;
END $$;
SQL
FRIEND346_ACTOR=$(psql -qAt -v ON_ERROR_STOP=1 -c "SELECT decision_user_id FROM public.friendships WHERE id='ffffffff-3468-0000-0000-000000000003'")
FRIEND346_PEER=$(psql -qAt -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN decision_user_id=requester_id THEN addressee_id ELSE requester_id END FROM public.friendships WHERE id='ffffffff-3468-0000-0000-000000000003'")
call_actor "$FRIEND346_ACTOR" friends_undo_reject > "$FRIEND346_TMP/a" & FRIEND346_A=$!
call_actor "$FRIEND346_PEER" friends_cancel > "$FRIEND346_TMP/b" & FRIEND346_B=$!
wait "$FRIEND346_A"
wait "$FRIEND346_B"
FRIEND346_UNDO=$(cat "$FRIEND346_TMP/a")
FRIEND346_CANCEL=$(cat "$FRIEND346_TMP/b")
[[ "$FRIEND346_CANCEL" == *'"ok": true'* ]]
[[ "$FRIEND346_UNDO" == *'"ok": true'* || "$FRIEND346_UNDO" == *'"err": "not_found"'* ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id='ffffffff-3468-0000-0000-000000000003' AND status='declined' AND cancelled_at IS NOT NULL AND declined_at IS NOT NULL AND email_send_count=1) THEN RAISE EXCEPTION 'undo revived revoked relationship'; END IF;
 IF (SELECT count(*) FROM public.mail_cooldowns WHERE action_key='friend:invite_after_reject' AND target_key IN ('pair:aaaaaaaa-3468-0000-0000-000000000001:bbbbbbbb-3468-0000-0000-000000000002','pair:bbbbbbbb-3468-0000-0000-000000000002:aaaaaaaa-3468-0000-0000-000000000001') AND next_allowed_at>now()+interval '29 days')<>2 THEN RAISE EXCEPTION 'cancel lost bidirectional refusal'; END IF;
 RAISE NOTICE '346 races OK: one withdrawal; undo cannot revive cancellation; both refusal clocks preserved';
END $$;
SQL
