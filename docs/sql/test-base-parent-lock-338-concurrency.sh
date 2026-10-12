#!/usr/bin/env bash
set -euo pipefail
BASE338_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.question_bases WHERE id='cccccccc-3388-0000-0000-000000000003';
DELETE FROM public.base_share_tasks WHERE base_id='cccccccc-3388-0000-0000-000000000003';
DELETE FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3388-0000-0000-000000000001:%';
DELETE FROM public.profiles WHERE id IN ('aaaaaaaa-3388-0000-0000-000000000001','bbbbbbbb-3388-0000-0000-000000000002');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3388-0000-0000-000000000001','bbbbbbbb-3388-0000-0000-000000000002');
SQL
 rm -rf "$BASE338_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('base:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3388-0000-0000-000000000001','raceowner338@example.net'),('bbbbbbbb-3388-0000-0000-000000000002','racerecipient338@example.net');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3388-0000-0000-000000000001','raceowner338@example.net','raceowner338'),('bbbbbbbb-3388-0000-0000-000000000002','racerecipient338@example.net','racerecipient338') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;

SQL

for BASE338_OPERATION in accept leave; do
 psql -q -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.question_bases(id,owner_id,name) VALUES('cccccccc-3388-0000-0000-000000000003','aaaaaaaa-3388-0000-0000-000000000001','Parent338');
SQL
 if [[ "$BASE338_OPERATION" == accept ]]; then
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status) VALUES('aaaaaaaa-3388-0000-0000-000000000001','cccccccc-3388-0000-0000-000000000003','bbbbbbbb-3388-0000-0000-000000000002','racerecipient338@example.net','viewer','pending');
SQL
  BASE338_CALL="public.base_share_accept((SELECT id FROM public.base_share_tasks WHERE base_id='cccccccc-3388-0000-0000-000000000003'))"
 else
  psql -q -v ON_ERROR_STOP=1 <<'SQL'
-- Dawną relację bez taska również trzeba zamknąć jako odmowę.
INSERT INTO public.question_base_shares(base_id,user_id,role) VALUES('cccccccc-3388-0000-0000-000000000003','bbbbbbbb-3388-0000-0000-000000000002'::uuid,'viewer');
SQL
  BASE338_CALL="public.leave_shared_base('cccccccc-3388-0000-0000-000000000003')"
 fi
 rm -f "$BASE338_TMP/locked"
 psql -qAt -v ON_ERROR_STOP=1 > "$BASE338_TMP/parent-$BASE338_OPERATION" <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT id FROM public.question_bases WHERE id='cccccccc-3388-0000-0000-000000000003' FOR UPDATE;
\! touch '$BASE338_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='base338-$BASE338_OPERATION' AND wait_event_type='Lock') INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'recipient did not wait on parent'; END IF;
END \$\$;
DELETE FROM public.question_bases WHERE id='cccccccc-3388-0000-0000-000000000003';
COMMIT;
SQL
 BASE338_PID=$!
 for BASE338_TRY in {1..100}; do [[ -f "$BASE338_TMP/locked" ]] && break; sleep 0.05; done
 [[ -f "$BASE338_TMP/locked" ]]
 PGAPPNAME="base338-$BASE338_OPERATION" psql -qAt -v ON_ERROR_STOP=1 > "$BASE338_TMP/recipient-$BASE338_OPERATION" <<SQL
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3388-0000-0000-000000000002',true);
DO \$\$ BEGIN
 IF $BASE338_CALL THEN RAISE EXCEPTION 'action survived parent deletion'; END IF;
END \$\$;
COMMIT;
SQL
 wait "$BASE338_PID"
 # Obecnie base_share_tasks.base_id nie ma FK; fizyczna kaskada jest w audycie grafu.
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.base_share_tasks WHERE base_id='cccccccc-3388-0000-0000-000000000003';
SQL
done

# Pair lock cannot wait after deleting an expired child (row/pair inversion).
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.question_bases(id,owner_id,name) VALUES('cccccccc-3388-0000-0000-000000000003','aaaaaaaa-3388-0000-0000-000000000001','Expired338');
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,created_at) VALUES('aaaaaaaa-3388-0000-0000-000000000001','cccccccc-3388-0000-0000-000000000003','bbbbbbbb-3388-0000-0000-000000000002','racerecipient338@example.net','viewer','pending',now()-interval '6 days');
SQL
rm -f "$BASE338_TMP/locked"
psql -qAt -v ON_ERROR_STOP=1 > "$BASE338_TMP/expiry-recipient" <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3388-0000-0000-000000000002',true);
SELECT public._base_share_pair_lock('cccccccc-3388-0000-0000-000000000003','bbbbbbbb-3388-0000-0000-000000000002');
\! touch '$BASE338_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='base338-newinvite' AND wait_event_type='Lock') INTO waiting;
  EXIT WHEN waiting; PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'invite did not wait on pair'; END IF;
 IF public.base_share_decline((SELECT id FROM public.base_share_tasks WHERE base_id='cccccccc-3388-0000-0000-000000000003')) THEN RAISE EXCEPTION 'expired decline'; END IF;
END \$\$;
COMMIT;
SQL
BASE338_PID=$!
for BASE338_TRY in {1..100}; do [[ -f "$BASE338_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$BASE338_TMP/locked" ]]
PGAPPNAME='base338-newinvite' psql -qAt -v ON_ERROR_STOP=1 > "$BASE338_TMP/expiry-owner" <<'SQL'
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3388-0000-0000-000000000001',true);
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.base_share_by_user('cccccccc-3388-0000-0000-000000000003','bbbbbbbb-3388-0000-0000-000000000002'::uuid,'editor');
 IF NOT r.ok OR (SELECT count(*) FROM public.base_share_tasks WHERE base_id='cccccccc-3388-0000-0000-000000000003')<>1 THEN RAISE EXCEPTION 'new invitation after expiry %',to_jsonb(r); END IF;
END $$;
COMMIT;
SQL
wait "$BASE338_PID"
echo '338 concurrency OK: parent deletion wins; expired child cleanup cannot deadlock pair'
