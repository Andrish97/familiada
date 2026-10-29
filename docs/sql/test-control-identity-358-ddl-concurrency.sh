#!/usr/bin/env bash
set -euo pipefail
CONTROL358_TMP=$(mktemp -d)
cleanup() {
 CONTROL358_STATUS=$?
 if [[ "$CONTROL358_STATUS" != 0 ]]; then cat "$CONTROL358_TMP/holder.log" "$CONTROL358_TMP/migration.log" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3584-0000-0000-000000000001','bbbbbbbb-3584-0000-0000-000000000002')"
 rm -rf "$CONTROL358_TMP"
 exit "$CONTROL358_STATUS"
}
trap cleanup EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF current_database() NOT IN ('fam','fam358ddl','fam358faithful') THEN RAISE EXCEPTION 'isolated database only'; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('aaaaaaaa-3584-0000-0000-000000000001','owner358ddl@example.invalid','{"username":"owner358ddl"}'),
 ('bbbbbbbb-3584-0000-0000-000000000002','recipient358ddl@example.invalid','{"username":"recipient358ddl"}');
INSERT INTO public.games(id,owner_id,name,type,status) VALUES('cccccccc-3584-0000-0000-000000000003','aaaaaaaa-3584-0000-0000-000000000001','DDL358','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id) VALUES('dddddddd-3584-0000-0000-000000000004','cccccccc-3584-0000-0000-000000000003','aaaaaaaa-3584-0000-0000-000000000001');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$CONTROL358_TMP/holder.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT 1 FROM public.games WHERE id='cccccccc-3584-0000-0000-000000000003' FOR UPDATE;
\! touch '$CONTROL358_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='control358-ddl' AND (wait_event='PgSleep' OR wait_event_type='Lock')) INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'missing migration retry barrier'; END IF;
END \$\$;
-- Old order: Game and then an INSERT that takes Auth FK references.
INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_id,device_type)
VALUES('dddddddd-3584-0000-0000-000000000004','cccccccc-3584-0000-0000-000000000003','aaaaaaaa-3584-0000-0000-000000000001','bbbbbbbb-3584-0000-0000-000000000002','host');
COMMIT;
SQL
CONTROL358_PID=$!
for CONTROL358_TRY in {1..100}; do [[ -f "$CONTROL358_TMP/locked" ]] && break; sleep .05; done
[[ -f "$CONTROL358_TMP/locked" ]]
PGAPPNAME=control358-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -v ON_ERROR_STOP=1 -f "${CONTROL358_MIGRATION:?}" > "$CONTROL358_TMP/migration.log" 2>&1
wait "$CONTROL358_PID"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF to_regprocedure('public.control_device_share_to_friend(uuid,text,uuid)') IS NULL THEN RAISE EXCEPTION 'friend API absent'; END IF;
 RAISE NOTICE 'Control358 DDL retry and old Game-first insert passed';
END $$;
SQL
