#!/usr/bin/env bash
set -euo pipefail
cleanup_staging="${1:?staging directory required}"
backup_dir="$cleanup_staging/legacy-control-backup"
mkdir -p "$backup_dir"
# Keep snapshots and the pre-cleanup schema on the production server.
# No snapshot payload or user data is printed into workflow logs.
if [[ "$(docker exec supabase-db psql -U supabase_admin -d postgres -Atqc "SELECT to_regclass('public.device_state') IS NOT NULL")" == "t" ]]; then
  docker exec supabase-db pg_dump -U supabase_admin -d postgres --schema-only --schema=public > "$backup_dir/public-schema.sql"
  docker exec supabase-db pg_dump -U supabase_admin -d postgres --table=public.device_state > "$backup_dir/device-state.sql"
  docker exec supabase-db psql -U supabase_admin -d postgres -Atqc 'SELECT control_version,count(*) FROM public.game_sessions GROUP BY control_version ORDER BY control_version; SELECT count(*) FROM public.site_activity_hours;' > "$backup_dir/history-counts.txt"
  echo 'Legacy Control snapshot and schema backup saved on production server.'
else
  echo 'Legacy snapshots already removed; no backup needed.'
fi
