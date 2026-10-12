#!/usr/bin/env bash
# Isolated DB only: old child-first account cleanup during FK deployment.
set -euo pipefail
BASE357_DDL_TMP=$(mktemp -d)
finish() {
 BASE357_DDL_STATUS=$?
 if [[ "$BASE357_DDL_STATUS" != 0 ]]; then cat "$BASE357_DDL_TMP/parent" "$BASE357_DDL_TMP/migration" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3574-0000-0000-000000000001','bbbbbbbb-3574-0000-0000-000000000002')"
 rm -rf "$BASE357_DDL_TMP"
 exit "$BASE357_DDL_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF current_database() NOT IN ('fam','fam357draft','fam357ddl') THEN RAISE EXCEPTION 'isolated database only'; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3574-0000-0000-000000000001','owner357ddl@example.invalid'),('bbbbbbbb-3574-0000-0000-000000000002','recipient357ddl@example.invalid');
INSERT INTO public.question_bases(id,owner_id,name) VALUES ('cccccccc-3574-0000-0000-000000000003','aaaaaaaa-3574-0000-0000-000000000001','DDL357');
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status) VALUES ('aaaaaaaa-3574-0000-0000-000000000001','cccccccc-3574-0000-0000-000000000003','bbbbbbbb-3574-0000-0000-000000000002','recipient357ddl@example.invalid','viewer','pending');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$BASE357_DDL_TMP/parent" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
DELETE FROM public.base_share_tasks WHERE recipient_user_id='bbbbbbbb-3574-0000-0000-000000000002';
\! touch '$BASE357_DDL_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='base357-ddl' AND (wait_event='PgSleep' OR wait_event_type='Lock')) INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'migration did not release its conflicting lock attempt'; END IF;
END \$\$;
DELETE FROM auth.users WHERE id='bbbbbbbb-3574-0000-0000-000000000002';
COMMIT;
SQL
BASE357_DDL_PID=$!
for BASE357_DDL_TRY in {1..100}; do [[ -f "$BASE357_DDL_TMP/locked" ]] && break; sleep .05; done
[[ -f "$BASE357_DDL_TMP/locked" ]]
PGAPPNAME=base357-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -1 -v ON_ERROR_STOP=1 -f "${BASE357_DDL_MIGRATION:-supabase/migrations/2026-10-12_357_base_share_sources.sql}" > "$BASE357_DDL_TMP/migration" 2>&1
wait "$BASE357_DDL_PID"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='bbbbbbbb-3574-0000-0000-000000000002') THEN RAISE EXCEPTION 'old account deletion did not finish'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='base_friend_source_delete' AND tgrelid='public.friendships'::regclass) THEN RAISE EXCEPTION 'identity trigger not published'; END IF;
 RAISE NOTICE '357 DDL race OK: old child-first account cleanup and identity deployment both finish';
END $$;
SQL
