#!/usr/bin/env bash
# Isolated DB only: old child-first account cleanup during FK deployment.
set -euo pipefail
PROPOSAL355_DDL_TMP=$(mktemp -d)
finish() {
 PROPOSAL355_DDL_STATUS=$?
 if [[ "$PROPOSAL355_DDL_STATUS" != 0 ]]; then cat "$PROPOSAL355_DDL_TMP/parent" "$PROPOSAL355_DDL_TMP/migration" 2>/dev/null || true; fi
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3554-0000-0000-000000000001','bbbbbbbb-3554-0000-0000-000000000002')"
 rm -rf "$PROPOSAL355_DDL_TMP"
 exit "$PROPOSAL355_DDL_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF current_database() NOT IN ('fam','fam355draft','fam355ddl') THEN RAISE EXCEPTION 'isolated database only'; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3554-0000-0000-000000000001','owner355ddl@example.invalid'),('bbbbbbbb-3554-0000-0000-000000000002','recipient355ddl@example.invalid');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES ('cccccccc-3554-0000-0000-000000000003','aaaaaaaa-3554-0000-0000-000000000001','DDL355','poll_text','poll_open','ddl355');
INSERT INTO public.poll_tasks(owner_id,game_id,recipient_user_id,poll_type,share_key_poll) VALUES ('aaaaaaaa-3554-0000-0000-000000000001','cccccccc-3554-0000-0000-000000000003','bbbbbbbb-3554-0000-0000-000000000002','poll_text','ddl355');
SQL
psql -qAt -v ON_ERROR_STOP=1 > "$PROPOSAL355_DDL_TMP/parent" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
DELETE FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3554-0000-0000-000000000002';
\! touch '$PROPOSAL355_DDL_TMP/locked'
DO \$\$ DECLARE waiting boolean:=false; BEGIN
 FOR attempt IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='proposal355-ddl' AND (wait_event='PgSleep' OR wait_event_type='Lock')) INTO waiting;
  EXIT WHEN waiting;
  PERFORM pg_sleep(.05);
 END LOOP;
 IF NOT waiting THEN RAISE EXCEPTION 'migration did not release its conflicting lock attempt'; END IF;
END \$\$;
DELETE FROM auth.users WHERE id='bbbbbbbb-3554-0000-0000-000000000002';
COMMIT;
SQL
PROPOSAL355_DDL_PID=$!
for PROPOSAL355_DDL_TRY in {1..100}; do [[ -f "$PROPOSAL355_DDL_TMP/locked" ]] && break; sleep .05; done
[[ -f "$PROPOSAL355_DDL_TMP/locked" ]]
PGAPPNAME=proposal355-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -1 -v ON_ERROR_STOP=1 -f "${PROPOSAL355_DDL_MIGRATION:-supabase/migrations/2026-10-12_355_friend_proposal_sources.sql}" > "$PROPOSAL355_DDL_TMP/migration" 2>&1
wait "$PROPOSAL355_DDL_PID"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='bbbbbbbb-3554-0000-0000-000000000002') THEN RAISE EXCEPTION 'old account deletion did not finish'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='friend_source_delete' AND tgrelid='public.poll_subscriptions'::regclass) THEN RAISE EXCEPTION 'identity trigger not published'; END IF;
 RAISE NOTICE '355 DDL race OK: old child-first account cleanup and identity deployment both finish';
END $$;
SQL
