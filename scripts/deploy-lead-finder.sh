#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════
# Deployment script for Lead Finder service (Docker)
# ═══════════════════════════════════════════════════════════
# Usage: ./deploy-lead-finder.sh /path/to/staging/dir

STAGING_DIR="${1:-}"
TARGET_DIR="/home/andrish97/supabase-selfhost/supabase/docker/services/lead-finder"
CONTAINER_NAME="familiada-lead-finder"
DOCKER_DIR="/home/andrish97/supabase-selfhost/supabase/docker"
PORT=8001

if [[ -z "$STAGING_DIR" || ! -d "$STAGING_DIR" ]]; then
  echo "Usage: $0 /absolute/path/to/staging_dir"
  exit 2
fi

echo "═══════════════════════════════════════════════════════"
echo "  Lead Finder Deployment (Docker)"
echo "═══════════════════════════════════════════════════════"
echo "Staging: $STAGING_DIR"
echo "Target:  $TARGET_DIR"
echo ""

# Create target directory
mkdir -p "$TARGET_DIR"

# Stop existing container
echo "⏹  Stopping existing container..."
if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
  docker stop "$CONTAINER_NAME"
  echo "   Container stopped"
else
  echo "   Container not running"
fi

# Remove old container
echo "🗑  Removing old container..."
docker rm "$CONTAINER_NAME" 2>/dev/null || echo "   Container did not exist"

# Sync new files
echo "📦 Deploying new files..."
rsync -az --delete --checksum \
  --exclude '__pycache__' \
  --exclude '.git' \
  "$STAGING_DIR/" "$TARGET_DIR/"

# Build Docker image
echo "🐳 Building Docker image..."
docker build -t familiada-lead-finder:latest "$TARGET_DIR/"

# Remove old image to prevent stale layers
echo "🧹 Cleaning old image..."
docker images --filter "dangling=true" -q | xargs -r docker rmi 2>/dev/null || true

# Start container
echo "▶️  Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p ${PORT}:8001 \
  --env-file "$DOCKER_DIR/.env" \
  -e TZ=Europe/Warsaw \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  --network="supabase_default" \
  familiada-lead-finder:latest

# Wait for container to start
sleep 5

# Health check
echo "🏥 Health check..."
if curl -sf http://localhost:${PORT}/health > /dev/null 2>&1; then
  echo "   ✅ Service is healthy!"
else
  echo "   ⚠️  Service may not have started properly"
  echo "   Check logs: docker logs $CONTAINER_NAME"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "═══════════════════════════════════════════════════════"
echo "Container: docker ps -f name=$CONTAINER_NAME"
echo "Logs:      docker logs -f $CONTAINER_NAME"
echo "API:       http://localhost:${PORT}/docs"
echo ""
