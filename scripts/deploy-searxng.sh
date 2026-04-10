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
REMOTE_SCRIPT="/home/andrish97/supabase-selfhost/supabase/scripts/deploy-searxng.sh"

# Staging directory on server (identical pattern to edge functions)
DEPLOY_DIR="/home/andrish97/.deploy/searxng"
SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
STAGING="$DEPLOY_DIR/$SHA"

echo "🚀 Deploying SearXNG to $REMOTE_USER@$REMOTE_HOST"
echo "   Source:  $LOCAL_DIR"
echo "   Staging: $STAGING"

# ── 1. Create staging dir ───────────────────────────────────
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p '$STAGING'"

# ── 2. Sync files to staging ────────────────────────────────
rsync -avz --delete --exclude '.DS_Store' \
  -e "ssh" \
  "$LOCAL_DIR/" \
  "$REMOTE_USER@$REMOTE_HOST:$STAGING/"

echo ""
echo "📦 Running remote deploy script..."

# ── 3. Execute remote script ────────────────────────────────
ssh "$REMOTE_USER@$REMOTE_HOST" "$REMOTE_SCRIPT '$STAGING'"

echo ""
echo "✅ Deploy complete!"