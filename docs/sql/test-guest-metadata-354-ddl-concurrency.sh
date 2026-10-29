#!/usr/bin/env bash
# Isolated DB only: old child-first account cleanup during FK deployment.
set -euo pipefail
GUEST354_DDL_TMP=$(mktemp -d)
finish() {
 GUEST354_DDL_STATUS=$?
 if [[ "$GUEST354_DDL_STATUS" != 0 ]]; then cat "$GUEST354_DDL_TMP/parent" "$GUEST354_DDL_TMP/migration" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3544-0000-0000-000000000001','bbbbbbbb-3544-0000-0000-000000000002')"
 rm -rf "$GUEST354_DDL_TMP"
 exit "$GUEST354_DDL_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF current_database() NOT IN ('fam','fam354draft') THEN RAISE EXCEPTION 'isolated database only'; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3544-0000-0000-000000000001','owner354ddl@example.invalid'),('bbbbbbbb-3544-0000-0000-000000000002','recipient354ddl@example.invalid');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES ('cccccccc-3544-0000-0000-000000000003','aaaaaaaa-3544-0000-0000-000000000001','DDL354','poll_text','poll_open','ddl354');
INSERT INTO public.poll_tasks(owner_id,game_id,recipient_user_id,poll_type,share_key_poll) VALUES ('aaaaaaaa-3544-0000-0000-000000000001','cccccccc-3544-0000-0000-000000000003','bbbbbbbb-3544-0000-0000-000000000002','poll_text','ddl354');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$GUEST354_DDL_TMP/parent" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
DELETE FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3544-0000-0000-000000000002';
\! touch '$GUEST354_DDL_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='guest354-ddl' AND (wait_event='PgSleep' OR wait_event_type='Lock')) INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'migration did not release its conflicting lock attempt'; END IF;
END \$\$;
DELETE FROM auth.users WHERE id='bbbbbbbb-3544-0000-0000-000000000002';
COMMIT;
SQL
GUEST354_DDL_PID=$!
for GUEST354_DDL_TRY in {1..100}; do [[ -f "$GUEST354_DDL_TMP/locked" ]] && break; sleep .05; done
[[ -f "$GUEST354_DDL_TMP/locked" ]]
PGAPPNAME=guest354-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -1 -v ON_ERROR_STOP=1 -f "${GUEST354_DDL_MIGRATION:-supabase/migrations/2026-10-12_354_guest_metadata_identity.sql}" > "$GUEST354_DDL_TMP/migration" 2>&1
wait "$GUEST354_DDL_PID"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='bbbbbbbb-3544-0000-0000-000000000002') THEN RAISE EXCEPTION 'old account deletion did not finish'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='auth_guest_identity_metadata' AND tgrelid='auth.users'::regclass) THEN RAISE EXCEPTION 'identity trigger not published'; END IF;
 RAISE NOTICE '354 DDL race OK: old child-first account cleanup and identity deployment both finish';
END $$;
SQL
