#!/usr/bin/env bash
set -euo pipefail
BASE337_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.question_bases WHERE id='cccccccc-3378-0000-0000-000000000003';
DELETE FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3378-0000-0000-000000000001:%';
DELETE FROM public.profiles WHERE id IN ('aaaaaaaa-3378-0000-0000-000000000001','bbbbbbbb-3378-0000-0000-000000000002');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3378-0000-0000-000000000001','bbbbbbbb-3378-0000-0000-000000000002');
SQL
 rm -rf "$BASE337_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('base:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3378-0000-0000-000000000001','raceowner337@example.net'),('bbbbbbbb-3378-0000-0000-000000000002','racerecipient337@example.net');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3378-0000-0000-000000000001','raceowner337@example.net','raceowner337'),('bbbbbbbb-3378-0000-0000-000000000002','racerecipient337@example.net','racerecipient337') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES('cccccccc-3378-0000-0000-000000000003','aaaaaaaa-3378-0000-0000-000000000001','Race337');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$BASE337_TMP/first" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3378-0000-0000-000000000001',true);
SELECT * FROM public.base_share_by_user('cccccccc-3378-0000-0000-000000000003','bbbbbbbb-3378-0000-0000-000000000002'::uuid,'viewer');
\! touch '$BASE337_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
BASE337_PID=$!
for BASE337_TRY in {1..100}; do [[ -f "$BASE337_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$BASE337_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3378-0000-0000-000000000001',true);
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.base_share_by_email('cccccccc-3378-0000-0000-000000000003',' RACERECIPIENT337@EXAMPLE.NET ','editor');
 IF r.err IS DISTINCT FROM 'already_pending' OR (SELECT count(*) FROM public.base_share_tasks WHERE base_id='cccccccc-3378-0000-0000-000000000003')<>1 THEN RAISE EXCEPTION 'concurrent duplicate %',to_jsonb(r); END IF;
END $$;
COMMIT;
SQL
wait "$BASE337_PID"
rm -f "$BASE337_TMP/locked"
psql -qAt -v ON_ERROR_STOP=1 > "$BASE337_TMP/refusal" <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3378-0000-0000-000000000002',true);
SELECT public.base_share_decline((SELECT id FROM public.base_share_tasks WHERE base_id='cccccccc-3378-0000-0000-000000000003'));
\! touch '$BASE337_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
BASE337_PID=$!
for BASE337_TRY in {1..100}; do [[ -f "$BASE337_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$BASE337_TMP/locked" ]]
psql -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3378-0000-0000-000000000002',true);
DO $$ BEGIN
 IF public.base_share_accept((SELECT id FROM public.base_share_tasks WHERE base_id='cccccccc-3378-0000-0000-000000000003')) THEN RAISE EXCEPTION 'accept races refusal'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3378-0000-0000-000000000001',true);
DO $$ BEGIN
 IF public.base_share_resend((SELECT id FROM public.base_share_tasks WHERE base_id='cccccccc-3378-0000-0000-000000000003'))->>'err'<>'not_pending' THEN RAISE EXCEPTION 'reminder races refusal'; END IF;
END $$;
COMMIT;
SQL
wait "$BASE337_PID"
echo '337 concurrency OK: single invitation, refusal blocks accept/reminder'
