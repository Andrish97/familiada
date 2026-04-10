#!/usr/bin/env bash
# ============================================================
# Deploy SearXNG to remote server via SSH
# Usage: ./scripts/deploy-searxng.sh
# ============================================================
set -euo pipefail

# ── Config ──────────────────────────────────────────────────
LOCAL_DIR="$(cd "$(dirname "$0")/../searxng" && pwd)"
REMOTE_USER="andrish97"
REMOTE_HOST="panel.familiada.online"

# Dokładna ścieżka do folderu searxng w Twoim dockerze (bezwzględna)
REMOTE_SEARXNG_DIR="/home/andrish97/supabase-selfhost/supabase/docker/searxng"
PARENT_DIR="/home/andrish97/supabase-selfhost/supabase/docker"

echo "🚀 Deploying SearXNG to $REMOTE_USER@$REMOTE_HOST:$REMOTE_SEARXNG_DIR"
echo "   Source: $LOCAL_DIR"

# ── Sync files ──────────────────────────────────────────────
rsync -avz --delete \
  --exclude '.DS_Store' \
  "$LOCAL_DIR/" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_SEARXNG_DIR/"

echo ""
echo "📦 Restarting SearXNG container..."

# ── Restart ─────────────────────────────────────────────────
ssh "$REMOTE_USER@$REMOTE_HOST" "
  cd $PARENT_DIR
  docker compose restart searxng
  echo '✅ SearXNG restarted successfully'
  docker ps --filter name=searxng --format 'table {{.Names}}\t{{.Status}}'
"

echo ""
echo "✅ Deploy complete!"
