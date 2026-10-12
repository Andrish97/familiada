#!/usr/bin/env bash
# Wyłącznie izolowany Postgres; pary oraz liczniki maili są serializowane.
set -euo pipefail
SUB333_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3338-0000-0000-000000000001:%';
DELETE FROM public.email_unsub_tokens WHERE email='race333@example.net';
DELETE FROM public.profiles WHERE id='aaaaaaaa-3338-0000-0000-000000000001';
DELETE FROM auth.users WHERE id='aaaaaaaa-3338-0000-0000-000000000001';
SQL
 rm -rf "$SUB333_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('poll:invite','pair',432000,true),('poll:resend','pair',432000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3338-0000-0000-000000000001','raceowner333@example.net');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3338-0000-0000-000000000001','raceowner333@example.net','raceowner333')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
SQL
# The first session keeps the pair lock until COMMIT. The second must see its insert.
psql -qAt -v ON_ERROR_STOP=1 > "$SUB333_TMP/first" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3338-0000-0000-000000000001',true);
SELECT public.subscribers_invite(' RACE333@EXAMPLE.NET ');
\! touch '$SUB333_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
SUB333_PID=$!
for SUB333_TRY in {1..100}; do [[ -f "$SUB333_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$SUB333_TMP/locked" ]]
psql -qAt -v ON_ERROR_STOP=1 > "$SUB333_TMP/second" <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3338-0000-0000-000000000001',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.subscribers_invite('race333@example.net');
 IF r->>'already' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'concurrent invite duplicate %',r; END IF;
END $$;
COMMIT;
SQL
wait "$SUB333_PID"
rm -f "$SUB333_TMP/locked"
psql -qAt -v ON_ERROR_STOP=1 > "$SUB333_TMP/first-resend" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3338-0000-0000-000000000001',true);
SELECT public.polls_hub_subscriber_resend((SELECT id FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3338-0000-0000-000000000001'));
\! touch '$SUB333_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
SUB333_PID=$!
for SUB333_TRY in {1..100}; do [[ -f "$SUB333_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$SUB333_TMP/locked" ]]
psql -qAt -v ON_ERROR_STOP=1 > "$SUB333_TMP/second-resend" <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3338-0000-0000-000000000001',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.polls_hub_subscriber_resend((SELECT id FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3338-0000-0000-000000000001'));
 IF r->>'err' IS DISTINCT FROM 'cooldown' THEN RAISE EXCEPTION 'concurrent resend budget %',r; END IF;
 IF (SELECT sum(email_send_count) FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3338-0000-0000-000000000001')<>1 THEN RAISE EXCEPTION 'double mail count'; END IF;
END $$;
COMMIT;
SQL
wait "$SUB333_PID"
# Refusal committed while resend waits must prevent a new reservation/count.
rm -f "$SUB333_TMP/locked"
psql -qAt -v ON_ERROR_STOP=1 > "$SUB333_TMP/decline" <<SQL &
BEGIN;
SELECT public.poll_go_sub_decline((SELECT token FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3338-0000-0000-000000000001'));
\! touch '$SUB333_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
SUB333_PID=$!
for SUB333_TRY in {1..100}; do [[ -f "$SUB333_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$SUB333_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3338-0000-0000-000000000001',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.polls_hub_subscriber_resend((SELECT id FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3338-0000-0000-000000000001'));
 IF r->>'err' IS DISTINCT FROM 'only pending can be resent' THEN RAISE EXCEPTION 'resend after concurrent refusal %',r; END IF;
 IF public.poll_sub_accept_email((SELECT token FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3338-0000-0000-000000000001'),'race333@example.net')->>'error' IS DISTINCT FROM 'already_closed' THEN RAISE EXCEPTION 'accept after refusal'; END IF;
END $$;
COMMIT;
SQL
wait "$SUB333_PID"
echo '333 concurrency OK: normalized invite, single resend count, refusal wins'
