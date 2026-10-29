#!/usr/bin/env bash
set -euo pipefail
POLL342_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.mail_queue WHERE created_by='aaaaaaaa-3428-0000-0000-000000000001';
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3428-0000-0000-000000000001','bbbbbbbb-3428-0000-0000-000000000002');
SQL
 rm -rf "$POLL342_TMP"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
-- Wyłącznie izolowana fixture zatwierdzonych adresów; baseline nie zasłania limitu3/24h.
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3428-0000-0000-000000000001','test7@familiada.online'),('bbbbbbbb-3428-0000-0000-000000000002','test8@familiada.online');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3428-0000-0000-000000000001','test7@familiada.online','raceowner342'),('bbbbbbbb-3428-0000-0000-000000000002','test8@familiada.online','racerecipient342') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$POLL342_TMP/first" <<SQL &
BEGIN;
INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
VALUES('aaaaaaaa-3428-0000-0000-000000000001','test8@familiada.online','Race342','<p>342</p>','poll:share','fixture:342:first');
\! touch '$POLL342_TMP/locked'
SELECT pg_sleep(2);
COMMIT;
SQL
POLL342_FIRST=$!
for POLL342_TRY in {1..100}; do [[ -f "$POLL342_TMP/locked" ]] && break; sleep 0.05; done
[[ -f "$POLL342_TMP/locked" ]]
POLL342_PIDS=()
for POLL342_INDEX in 1 2 3; do
 psql -qAt -v ON_ERROR_STOP=1 > "$POLL342_TMP/result-$POLL342_INDEX" <<'SQL' &
DO $$ BEGIN
 BEGIN
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
  VALUES('aaaaaaaa-3428-0000-0000-000000000001','TEST8@FAMILIADA.ONLINE','Race342','<p>342</p>','poll:share','fixture:342:parallel');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'cooldown_active: poll daily_cap%' THEN RAISE; END IF;
 END;
END $$;
SQL
 POLL342_PIDS+=("$!")
done
wait "$POLL342_FIRST"
for POLL342_PID in "${POLL342_PIDS[@]}"; do wait "$POLL342_PID"; done
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.mail_queue WHERE created_by='aaaaaaaa-3428-0000-0000-000000000001')<>3
 OR (SELECT count(*) FROM public.poll_mail_budget_events WHERE owner_id='aaaaaaaa-3428-0000-0000-000000000001')<>3 THEN RAISE EXCEPTION 'parallel budget admitted other than3'; END IF;
 DELETE FROM public.mail_queue WHERE created_by='aaaaaaaa-3428-0000-0000-000000000001';
 IF public._poll_daily_cap_until('aaaaaaaa-3428-0000-0000-000000000001','test8@familiada.online') IS NULL THEN RAISE EXCEPTION 'queue cleanup resets parallel cap'; END IF;
END $$;
SQL
echo '342 concurrency OK: exactly3 of4, delivery keeps daily cap'
