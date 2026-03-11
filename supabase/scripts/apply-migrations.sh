#!/usr/bin/env bash
set -uo pipefail

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
if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.schema_migrations (
  filename   text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now(),
  git_sha    text null
);
SQL
then
  log "ERROR: failed to ensure schema_migrations table"
  exit 4
fi
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

# Build supersedes map from "-- SUPERSEDES: <filename>" comments in migration headers.
# If migration B has "-- SUPERSEDES: A.sql", a checksum mismatch on A is accepted and
# the stored checksum is updated; B is then applied normally in sorted order.
declare -A SUPERSEDES_MAP   # superseded_filename → superseding_filename
for f in "${MIG_FILES[@]}"; do
  while IFS= read -r line; do
    if [[ "$line" =~ ^--[[:space:]]*SUPERSEDES:[[:space:]]*(.+)$ ]]; then
      target="${BASH_REMATCH[1]}"
      target="${target%"${target##*[![:space:]]}"}"  # rtrim
      SUPERSEDES_MAP["$target"]="$(basename "$f")"
      break
    fi
  done < <(head -5 "$f")
done

if (( ${#SUPERSEDES_MAP[@]} > 0 )); then
  log "SUPERSEDES declarations found:"
  for k in "${!SUPERSEDES_MAP[@]}"; do
    log "  ${SUPERSEDES_MAP[$k]} supersedes $k"
  done
  log
fi

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
        superseded_by="${SUPERSEDES_MAP[$base]:-}"
        if [[ -n "$superseded_by" ]]; then
          log "WARN  $base: checksum mismatch, superseded by $superseded_by — updating stored checksum"
          log "  stored : $row"
          log "  current: $checksum"
          if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c \
              "update public.schema_migrations set checksum = '$esc_sum' where filename = '$esc_base';"; then
            log "ERROR: failed to update checksum for $base"
            exit 10
          fi
        else
          log "ERROR: checksum mismatch for already applied migration: $base"
          log "  applied: $row"
          log "  current: $checksum"
          log "  Tip: add '-- SUPERSEDES: $base' to a newer fix migration to accept this change."
          exit 10
        fi
      else
        log "SKIP  $base (already applied)"
      fi
      continue
    fi

    # Bootstrap baseline
    if [[ "${APPLIED_COUNT:-0}" == "0" && "${EXISTING_PUBLIC_TABLES:-0}" != "0" && "$base" == *baseline* ]]; then
      log "BOOT  $base (existing DB detected)"
      if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c \
          "insert into public.schema_migrations(filename, checksum, git_sha)
           values ('$esc_base', '$esc_sum', nullif('$esc_sha',''));"; then
        log "FAIL  $base (failed to record baseline)"
        exit 5
      fi
      APPLIED_COUNT="$((APPLIED_COUNT + 1))"
      continue
    fi

    log "APPLY $base"

    if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 -1 -f "/dev/stdin" < "$f"; then
      log "FAIL  $base (SQL error — see output above)"
      exit 5
    fi

    if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 -c \
        "insert into public.schema_migrations(filename, checksum, git_sha)
         values ('$esc_base', '$esc_sum', nullif('$esc_sha',''));"; then
      log "FAIL  $base (failed to record in schema_migrations)"
      exit 6
    fi

    log "OK    $base"
  done
fi

log
log "== Dump schema.sql (schema-only) =="

if ! docker exec -i "$DB_CONTAINER" bash -lc '
set -euo pipefail
pg_dump -U supabase_admin -d postgres \
  --schema=public \
  --schema=graphql_public \
  --schema-only \
  --no-owner --no-acl \
  --quote-all-identifiers
' > "$OUT_DIR/schema.sql"; then
  log "WARN: pg_dump failed — schema.sql not written"
fi

log "Wrote: $OUT_DIR/schema.sql ($(wc -l < "$OUT_DIR/schema.sql" 2>/dev/null || echo 0) lines)"
log
log "DONE"
