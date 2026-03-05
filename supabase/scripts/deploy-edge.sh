#!/usr/bin/env bash
set -euo pipefail

# host paths
TARGET_DIR="/home/andrish97/supabase-selfhost/supabase/docker/volumes/functions"
STAGING_DIR="${1:-}"

if [[ -z "$STAGING_DIR" || ! -d "$STAGING_DIR" ]]; then
  echo "Usage: $0 /absolute/path/to/staging_dir"
  exit 2
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "ERROR: TARGET_DIR not found: $TARGET_DIR"
  exit 3
fi

echo "== Deploy edge functions =="
echo "STAGING: $STAGING_DIR"
echo "TARGET : $TARGET_DIR"
echo

# 1) Deploy/update each function dir from staging (EXCEPT main)
#    We treat each folder as a function.
shopt -s nullglob
for src in "$STAGING_DIR"/*; do
  name="$(basename "$src")"

  if [[ "$name" == "main" ]]; then
    echo "SKIP main (protected)"
    continue
  fi

  if [[ ! -d "$src" ]]; then
    continue
  fi

  echo "SYNC  $name"
  mkdir -p "$TARGET_DIR/$name"

  # mirror contents, delete files removed in GH inside this function folder
  rsync -a --delete --checksum \
    --exclude '.DS_Store' \
    "$src/" "$TARGET_DIR/$name/"

  # optional: ensure ownership matches container user (1003:1003)
  # if your host permissions are already fine, this is harmless.
  chown -R 1003:1003 "$TARGET_DIR/$name" || true
done

# 2) Cleanup: remove function dirs that exist on server but not in staging (EXCEPT main)
echo
echo "== Cleanup removed functions (except main) =="
for dst in "$TARGET_DIR"/*; do
  name="$(basename "$dst")"

  [[ "$name" == "main" ]] && continue
  [[ ! -d "$dst" ]] && continue

  if [[ ! -d "$STAGING_DIR/$name" ]]; then
    echo "REMOVE $name (not present in GH staging)"
    rm -rf "$dst"
  fi
done

# 3) Restart container
echo
echo "== Restart supabase-edge-functions =="
docker restart supabase-edge-functions >/dev/null
echo "OK"


