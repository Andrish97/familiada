#!/usr/bin/env bash
set -euo pipefail

STAGING_DIR="${1:-}"
if [[ -z "$STAGING_DIR" || ! -d "$STAGING_DIR" ]]; then
  echo "Usage: $0 /absolute/path/to/staging_dir"
  exit 2
fi

MIG_DIR="$STAGING_DIR/migrations"
OUT_DIR="$STAGING_DIR/out"
mkdir -p "$OUT_DIR"

LATEST_LOG="$OUT_DIR/latest.log"
TS="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
RUN_LOG="$OUT_DIR/${TS}.log"

DB_CONTAINER="supabase-db"
DB_USER="supabase_admin"
DB_NAME="postgres"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

# Escape single quotes for SQL string literals
sql_q() {
  printf "%s" "$1" | sed "s/'/''/g"
}

exec > >(tee "$LATEST_LOG" "$RUN_LOG") 2>&1

log "== DB migrations runner =="
log "STAGING_DIR: $STAGING_DIR"
log "MIG_DIR    : $MIG_DIR"
log "OUT_DIR    : $OUT_DIR"
log

if [[ ! -d "$MIG_DIR" ]]; then
  log "ERROR: migrations directory not found: $MIG_DIR"
  exit 3
fi

# Ensure tracking table exists
log "== Ensure public.schema_migrations =="
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.schema_migrations (
  filename   text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now(),
  git_sha    text null
);
SQL
log "OK"
log

# Check existing schema state
EXISTING_PUBLIC_TABLES="$(
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_name <> 'schema_migrations';" \
  | tr -d '\r'
)"

APPLIED_COUNT="$(
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c \
  "select count(*) from public.schema_migrations;" \
  | tr -d '\r'
)"

log "Existing public tables (excluding schema_migrations): ${EXISTING_PUBLIC_TABLES:-0}"
log "Applied migrations in tracking table: ${APPLIED_COUNT:-0}"
log

shopt -s nullglob
MIG_FILES=( "$MIG_DIR"/*.sql )

if (( ${#MIG_FILES[@]} == 0 )); then
  log "No migrations found (*.sql). Nothing to do."
else
  log "== Apply migrations (sorted) =="

  IFS=$'\n' MIG_FILES_SORTED=( $(printf "%s\n" "${MIG_FILES[@]}" | sort) )
  unset IFS

  for f in "${MIG_FILES_SORTED[@]}"; do
    base="$(basename "$f")"
    checksum="$(sha256sum "$f" | awk '{print $1}')"

    esc_base="$(sql_q "$base")"
    esc_sum="$(sql_q "$checksum")"
    esc_sha="$(sql_q "${GITHUB_SHA:-}")"

    # Check if already applied
    row="$(
      docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c \
      "select checksum from public.schema_migrations where filename = '$esc_base';" \
      | tr -d '\r'
    )" || true

    if [[ -n "${row:-}" ]]; then
      if [[ "$row" != "$checksum" ]]; then
        log "ERROR: checksum mismatch for already applied migration: $base"
        log "  applied: $row"
        log "  current: $checksum"
        exit 10
      fi
      log "SKIP  $base (already applied)"
      continue
    fi

    # Bootstrap baseline
    if [[ "${APPLIED_COUNT:-0}" == "0" && "${EXISTING_PUBLIC_TABLES:-0}" != "0" && "$base" == *baseline* ]]; then
      log "BOOT  $base (existing DB detected)"
      docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c \
      "insert into public.schema_migrations(filename, checksum, git_sha)
       values ('$esc_base', '$esc_sum', nullif('$esc_sha',''));"
      APPLIED_COUNT="$((APPLIED_COUNT + 1))"
      continue
    fi

    log "APPLY $base"

    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 -1 -f "/dev/stdin" < "$f"

    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 -c \
      "insert into public.schema_migrations(filename, checksum, git_sha)
       values ('$esc_base', '$esc_sum', nullif('$esc_sha',''));"

    log "OK    $base"
  done
fi

log
log "== Dump schema.sql (schema-only) =="

docker exec -i "$DB_CONTAINER" bash -lc '
set -euo pipefail
pg_dump -U supabase_admin -d postgres \
  --schema=public \
  --schema=graphql_public \
  --schema-only \
  --no-owner --no-acl \
  --quote-all-identifiers
' > "$OUT_DIR/schema.sql"

log "Wrote: $OUT_DIR/schema.sql ($(wc -l < "$OUT_DIR/schema.sql") lines)"
log
log "DONE"