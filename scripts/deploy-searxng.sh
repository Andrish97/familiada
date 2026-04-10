#!/usr/bin/env bash
# ============================================================
# Deploy SearXNG to remote server via SSH
# Usage: ./scripts/deploy-searxng.sh
# ============================================================
set -euo pipefail

# ── Config ──────────────────────────────────────────────────
REMOTE_USER="${SEARXNG_USER:-andrish97}"
REMOTE_HOST="${SEARXNG_HOST:-panel.familiada.online}"
REMOTE_DIR="${SEARXNG_DIR:-~/searxng}"
LOCAL_DIR="$(cd "$(dirname "$0")/../searxng" && pwd)"

# ── Validate ────────────────────────────────────────────────
if [ ! -f "$LOCAL_DIR/docker-compose.yml" ]; then
  echo "❌ Error: $LOCAL_DIR/docker-compose.yml not found"
  echo "   Make sure searxng/ folder exists at project root"
  exit 1
fi

if ! command -v rsync &> /dev/null; then
  echo "❌ Error: rsync is required"
  exit 1
fi

echo "🚀 Deploying SearXNG to $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"
echo "   Source: $LOCAL_DIR"

# ── Sync files ──────────────────────────────────────────────
rsync -avz --delete \
  --exclude '.DS_Store' \
  --exclude 'node_modules' \
  "$LOCAL_DIR/" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

echo ""
echo "📦 Restarting SearXNG containers..."

# ── Restart ─────────────────────────────────────────────────
ssh "$REMOTE_USER@$REMOTE_HOST" "
  cd $REMOTE_DIR
  docker compose pull
  docker compose up -d --remove-orphans
  echo '✅ SearXNG restarted successfully'
  docker ps --filter name=searxng --format 'table {{.Names}}\t{{.Status}}'
"

echo ""
echo "✅ Deploy complete!"
