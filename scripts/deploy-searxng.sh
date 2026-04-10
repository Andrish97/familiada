#!/usr/bin/env bash
set -euo pipefail

STAGING_DIR="$1"
TARGET_DIR="/home/andrish97/supabase-selfhost/supabase/docker/searxng"
DOCKER_DIR="/home/andrish97/supabase-selfhost/supabase/docker"

if [ -z "$STAGING_DIR" ]; then
  echo "❌ Error: Staging directory not found"
  exit 1
fi

echo "📦 Deploying SearXNG..."
rsync -az --delete "$STAGING_DIR/" "$TARGET_DIR/"

echo "🔄 Restarting container..."
cd "$DOCKER_DIR" && docker compose restart searxng

echo "✅ Done"
rm -rf "$STAGING_DIR"
