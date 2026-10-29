#!/usr/bin/env bash
# Isolated DB only: old child-first account cleanup during FK deployment.
set -euo pipefail
IDENTITY351_DDL_TMP=$(mktemp -d)
finish() {
 IDENTITY351_DDL_STATUS=$?
 if [[ "$IDENTITY351_DDL_STATUS" != 0 ]]; then cat "$IDENTITY351_DDL_TMP/parent" "$IDENTITY351_DDL_TMP/migration" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3519-0000-0000-000000000001','bbbbbbbb-3519-0000-0000-000000000002')"
 rm -rf "$IDENTITY351_DDL_TMP"
 exit "$IDENTITY351_DDL_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3519-0000-0000-000000000001','owner348ddl@example.invalid'),('bbbbbbbb-3519-0000-0000-000000000002','recipient348ddl@example.invalid');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES ('cccccccc-3519-0000-0000-000000000003','aaaaaaaa-3519-0000-0000-000000000001','DDL351','poll_text','poll_open','ddl351');
INSERT INTO public.poll_tasks(owner_id,game_id,recipient_user_id,poll_type,share_key_poll) VALUES ('aaaaaaaa-3519-0000-0000-000000000001','cccccccc-3519-0000-0000-000000000003','bbbbbbbb-3519-0000-0000-000000000002','poll_text','ddl351');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$IDENTITY351_DDL_TMP/parent" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
DELETE FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3519-0000-0000-000000000002';
\! touch '$IDENTITY351_DDL_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='identity351-ddl' AND (wait_event='PgSleep' OR wait_event_type='Lock')) INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'migration did not release its conflicting lock attempt'; END IF;
END \$\$;
DELETE FROM auth.users WHERE id='bbbbbbbb-3519-0000-0000-000000000002';
COMMIT;
SQL
IDENTITY351_DDL_PID=$!
for IDENTITY351_DDL_TRY in {1..100}; do [[ -f "$IDENTITY351_DDL_TMP/locked" ]] && break; sleep .05; done
[[ -f "$IDENTITY351_DDL_TMP/locked" ]]
PGAPPNAME=identity351-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -1 -v ON_ERROR_STOP=1 -f "${IDENTITY351_DDL_MIGRATION:-supabase/migrations/2026-10-12_351_poll_recipient_identity.sql}" > "$IDENTITY351_DDL_TMP/migration" 2>&1
wait "$IDENTITY351_DDL_PID"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='bbbbbbbb-3519-0000-0000-000000000002') THEN RAISE EXCEPTION 'old account deletion did not finish'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='poll_identity_auth_change' AND tgrelid='auth.users'::regclass) THEN RAISE EXCEPTION 'identity trigger not published'; END IF;
 RAISE NOTICE '351 DDL race OK: old child-first account cleanup and identity deployment both finish';
END $$;
SQL
