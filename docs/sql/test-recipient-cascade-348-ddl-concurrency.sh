#!/usr/bin/env bash
# Isolated DB only: old child-first account cleanup during FK deployment.
set -euo pipefail
ACCOUNT348_DDL_TMP=$(mktemp -d)
finish() {
 ACCOUNT348_DDL_STATUS=$?
 if [[ "$ACCOUNT348_DDL_STATUS" != 0 ]]; then cat "$ACCOUNT348_DDL_TMP/parent" "$ACCOUNT348_DDL_TMP/migration" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3489-0000-0000-000000000001','bbbbbbbb-3489-0000-0000-000000000002')"
 rm -rf "$ACCOUNT348_DDL_TMP"
 exit "$ACCOUNT348_DDL_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3489-0000-0000-000000000001','owner348ddl@example.invalid'),('bbbbbbbb-3489-0000-0000-000000000002','recipient348ddl@example.invalid');
INSERT INTO public.question_bases(id,owner_id,name) VALUES ('cccccccc-3489-0000-0000-000000000003','aaaaaaaa-3489-0000-0000-000000000001','DDL348');
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id) VALUES ('aaaaaaaa-3489-0000-0000-000000000001','cccccccc-3489-0000-0000-000000000003','bbbbbbbb-3489-0000-0000-000000000002');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$ACCOUNT348_DDL_TMP/parent" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
DELETE FROM public.base_share_tasks WHERE recipient_user_id='bbbbbbbb-3489-0000-0000-000000000002';
\! touch '$ACCOUNT348_DDL_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='account348-ddl' AND (wait_event='PgSleep' OR wait_event_type='Lock')) INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'migration did not release its conflicting lock attempt'; END IF;
END \$\$;
DELETE FROM auth.users WHERE id='bbbbbbbb-3489-0000-0000-000000000002';
COMMIT;
SQL
ACCOUNT348_DDL_PID=$!
for ACCOUNT348_DDL_TRY in {1..100}; do [[ -f "$ACCOUNT348_DDL_TMP/locked" ]] && break; sleep .05; done
[[ -f "$ACCOUNT348_DDL_TMP/locked" ]]
PGAPPNAME=account348-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -1 -v ON_ERROR_STOP=1 -f "${ACCOUNT348_DDL_MIGRATION:-supabase/migrations/2026-10-11_348_recipient_task_account_cascade.sql}" > "$ACCOUNT348_DDL_TMP/migration" 2>&1
wait "$ACCOUNT348_DDL_PID"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='bbbbbbbb-3489-0000-0000-000000000002') THEN RAISE EXCEPTION 'old account deletion did not finish'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conname IN ('base_share_tasks_recipient_user_id_fkey','poll_tasks_recipient_user_id_fkey','poll_subscriptions_subscriber_user_id_fkey') AND confdeltype<>'c') THEN RAISE EXCEPTION 'cascade not published'; END IF;
 RAISE NOTICE '348 DDL race OK: old child-first account cleanup and parent-first FK deployment both finish';
END $$;
SQL
