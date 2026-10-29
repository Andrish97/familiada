#!/usr/bin/env bash
set -euo pipefail
POLL347_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3478-0000-0000-000000000001:%' OR target_key='pair:bbbbbbbb-3478-0000-0000-000000000002:aaaaaaaa-3478-0000-0000-000000000001';
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3478-0000-0000-000000000001','bbbbbbbb-3478-0000-0000-000000000002');
SQL
 rm -rf "$POLL347_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES ('poll:share','pair',432000,true),('friend:invite_after_reject','pair',2592000,true),('poll:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3478-0000-0000-000000000001','a347race@example.invalid'),('bbbbbbbb-3478-0000-0000-000000000002','b347race@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-3478-0000-0000-000000000001','a347race@example.invalid','racea347'),('bbbbbbbb-3478-0000-0000-000000000002','b347race@example.invalid','raceb347') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES ('dddddddd-3478-0000-0000-000000000004','aaaaaaaa-3478-0000-0000-000000000001','Race347','poll_text','poll_open','race347');
SQL
for POLL347_KIND in friend subscriber; do
 for POLL347_ORDER in close-first share-first; do
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.poll_tasks WHERE game_id='dddddddd-3478-0000-0000-000000000004';
DELETE FROM public.friendships WHERE requester_id='aaaaaaaa-3478-0000-0000-000000000001';
DELETE FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3478-0000-0000-000000000001';
DELETE FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3478-0000-0000-000000000001:%' OR target_key='pair:bbbbbbbb-3478-0000-0000-000000000002:aaaaaaaa-3478-0000-0000-000000000001';
INSERT INTO public.friendships(id,requester_id,addressee_id,status) VALUES ('ffffffff-3478-0000-0000-000000000006','aaaaaaaa-3478-0000-0000-000000000001','bbbbbbbb-3478-0000-0000-000000000002','active');
INSERT INTO public.poll_subscriptions(id,token,owner_id,subscriber_email,status) VALUES ('ffffffff-3478-0000-0000-000000000007','ffffffff-3478-0000-0000-000000000008','aaaaaaaa-3478-0000-0000-000000000001','anonymous347race@example.invalid','active');
SQL
  if [[ "$POLL347_KIND" == friend ]]; then
   POLL347_CLOSE="IF public.friends_remove('ffffffff-3478-0000-0000-000000000006')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'close failed'; END IF;"
   POLL347_SHARE="public.poll_share_send('dddddddd-3478-0000-0000-000000000004',ARRAY['bbbbbbbb-3478-0000-0000-000000000002']::uuid[],'{}')"
  else
   POLL347_CLOSE="IF public.poll_sub_unsubscribe('ffffffff-3478-0000-0000-000000000008')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'close failed'; END IF;"
   POLL347_SHARE="public.poll_share_send('dddddddd-3478-0000-0000-000000000004','{}',ARRAY['ffffffff-3478-0000-0000-000000000007']::uuid[])"
  fi
  if [[ "$POLL347_ORDER" == close-first ]]; then
   POLL347_HOLDER="$POLL347_CLOSE"
   POLL347_WAITER="IF ($POLL347_SHARE)->>'created' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'share survived prior withdrawal'; END IF;"
  else
   POLL347_HOLDER="IF ($POLL347_SHARE)->>'created' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'fixture share failed'; END IF;"
   POLL347_WAITER="$POLL347_CLOSE"
  fi
  rm -f "$POLL347_TMP/locked"
  psql -qAt -v ON_ERROR_STOP=1 > "$POLL347_TMP/holder" <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL "request.jwt.claim.sub"='aaaaaaaa-3478-0000-0000-000000000001';
DO \$\$ BEGIN $POLL347_HOLDER END \$\$;
\! touch '$POLL347_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='poll347-waiter' AND wait_event_type='Lock') INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'contact action did not serialize'; END IF;
END \$\$;
COMMIT;
SQL
  POLL347_PID=$!
  for POLL347_TRY in {1..100}; do [[ -f "$POLL347_TMP/locked" ]] && break; sleep .05; done
  [[ -f "$POLL347_TMP/locked" ]]
  PGAPPNAME=poll347-waiter psql -qAt -v ON_ERROR_STOP=1 > "$POLL347_TMP/waiter" <<SQL
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL "request.jwt.claim.sub"='aaaaaaaa-3478-0000-0000-000000000001';
DO \$\$ BEGIN $POLL347_WAITER END \$\$;
COMMIT;
SQL
  wait "$POLL347_PID"
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id='dddddddd-3478-0000-0000-000000000004' AND status IN ('pending','opened')) THEN RAISE EXCEPTION 'live task after contact withdrawal race'; END IF;
END $$;
SQL
 done
done
