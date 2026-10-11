#!/usr/bin/env bash
# Isolated database only: old parent deletion must finish during rollout.
set -euo pipefail
POLL347_DDL_TMP=$(mktemp -d)
cleanup() {
 psql -q -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id='aaaaaaaa-3471-0000-0000-000000000001'"
 rm -rf "$POLL347_DDL_TMP"
}
finish() {
 POLL347_DDL_STATUS=$?
 if [[ "$POLL347_DDL_STATUS" != 0 ]]; then
  cat "$POLL347_DDL_TMP/parent" "$POLL347_DDL_TMP/migration" 2>/dev/null || true
 fi
 cleanup
 exit "$POLL347_DDL_STATUS"
}
trap finish EXIT
psql -q -v ON_ERROR_STOP=1 -c 'DROP TRIGGER IF EXISTS poll_tasks_cleanup_partial_votes ON public.poll_tasks'
psql -q -v ON_ERROR_STOP=1 -f docs/sql/seed-poll-contact-cleanup-347.sql
psql -qAt -v ON_ERROR_STOP=1 > "$POLL347_DDL_TMP/parent" <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s';
-- Hold the legacy vote row before the task cascade acquires its table lock.
DELETE FROM public.poll_text_entries WHERE game_id='dddddddd-3471-0000-0000-000000000004';
\! touch '$POLL347_DDL_TMP/locked'
\! timeout 8 sh -c "until test -f '$POLL347_DDL_TMP/finished'; do sleep .05; done"
\if :SHELL_ERROR
DO \$\$ BEGIN RAISE EXCEPTION 'rollout waited on locked historical rows'; END \$\$;
\endif
DELETE FROM public.games WHERE owner_id='aaaaaaaa-3471-0000-0000-000000000001';
COMMIT;
SQL
POLL347_DDL_PARENT=$!
for POLL347_DDL_TRY in {1..100}; do [[ -f "$POLL347_DDL_TMP/locked" ]] && break; sleep .05; done
[[ -f "$POLL347_DDL_TMP/locked" ]]
PGAPPNAME=poll347-ddl PGOPTIONS='-c statement_timeout=15000' psql -q -v ON_ERROR_STOP=1 -f "${POLL347_DDL_MIGRATION:-supabase/migrations/2026-10-11_347_poll_contact_locks_and_partial_cleanup.sql}" > "$POLL347_DDL_TMP/migration" 2>&1
touch "$POLL347_DDL_TMP/finished"
wait "$POLL347_DDL_PARENT"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE owner_id='aaaaaaaa-3471-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM public.poll_tasks WHERE owner_id='aaaaaaaa-3471-0000-0000-000000000001') THEN RAISE EXCEPTION 'parent deletion incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='poll_tasks_cleanup_partial_votes' AND NOT tgisinternal) THEN RAISE EXCEPTION 'rollout lost trigger'; END IF;
 RAISE NOTICE '347 DDL race OK: game cascade and historical cleanup both finish';
END $$;
SQL
