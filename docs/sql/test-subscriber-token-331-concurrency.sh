#!/usr/bin/env bash
# Izolowany Postgres: przegrana akceptacja nie wskrzesza cofnięcia/odmowy.
set -euo pipefail
SUB331_TMP=$(mktemp -d)
cleanup() {
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.profiles WHERE id='aaaaaaaa-3318-0000-0000-000000000001';
DELETE FROM auth.users WHERE id='aaaaaaaa-3318-0000-0000-000000000001';
SQL
  rm -rf "$SUB331_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3318-0000-0000-000000000001','raceowner331@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3318-0000-0000-000000000001','raceowner331@example.net','raceowner331')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.poll_subscriptions(id,token,owner_id,subscriber_email,status) VALUES
 ('ffffffff-3318-0000-0000-000000000001','ffffffff-3318-0000-0000-000000000002',
 'aaaaaaaa-3318-0000-0000-000000000001','race331@example.net','pending');
SQL
for SUB331_STATE in declined cancelled; do
  psql -q -v ON_ERROR_STOP=1 -c "UPDATE public.poll_subscriptions SET status='pending',declined_at=NULL,cancelled_at=NULL WHERE id='ffffffff-3318-0000-0000-000000000001'"
  rm -f "$SUB331_TMP/locked"
  psql -qAt -v ON_ERROR_STOP=1 > "$SUB331_TMP/close" <<SQL &
BEGIN;
UPDATE public.poll_subscriptions SET status='$SUB331_STATE' WHERE id='ffffffff-3318-0000-0000-000000000001';
\! touch '$SUB331_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
  SUB331_PID=$!
  for SUB331_TRY in {1..100}; do
    [[ -f "$SUB331_TMP/locked" ]] && break
    sleep 0.05
  done
  [[ -f "$SUB331_TMP/locked" ]]
  psql -qAt -v ON_ERROR_STOP=1 > "$SUB331_TMP/accept" <<'SQL'
SELECT public.poll_go_subscribe_email('ffffffff-3318-0000-0000-000000000002','race331@example.net');
SQL
  wait "$SUB331_PID"
  [[ "$(cat "$SUB331_TMP/accept")" == f ]]
  psql -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
 IF (SELECT count(*) FROM public.poll_subscriptions WHERE owner_id='aaaaaaaa-3318-0000-0000-000000000001')<>1
 OR (SELECT status FROM public.poll_subscriptions WHERE id='ffffffff-3318-0000-0000-000000000001')<>'$SUB331_STATE' THEN
   RAISE EXCEPTION 'concurrent acceptance revived closed token';
 END IF;
 RAISE NOTICE '331 concurrency OK: $SUB331_STATE wins, acceptance blocked';
END \$\$;
SQL
done
