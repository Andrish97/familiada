# SearXNG deployment for Familiada

This folder contains the complete SearXNG configuration managed via Git.

## Files

- `docker-compose.yml` - Docker configuration
- `settings.yml` - SearXNG application settings
- `familiada.css` - Custom theme matching familiada.online design
- `logo.svg` (optional) - Custom logo to replace SearXNG branding

## Local Deploy

Run the deploy script from project root:

```bash
./scripts/deploy-searxng.sh
```

**Environment variables** (optional, defaults shown):
```bash
SEARXNG_USER=andrish97       # SSH user
SEARXNG_HOST=panel.familiada.online  # Server host
SEARXNG_DIR=~/searxng        # Remote directory
```

## GitHub Actions

This folder is deployed automatically via `.github/workflows/deploy-searxng.yml` when:
- Changes are pushed to `main` in the `searxng/` path
- Or triggered manually via `workflow_dispatch`

**Required repository secrets:**
- `SEARXNG_SSH_KEY` - Private SSH key for server access
- `SEARXNG_HOST` - Server hostname (e.g. `panel.familiada.online`)
- `SEARXNG_USER` - SSH username (e.g. `andrish97`)
- `SEARXNG_DIR` - Remote path (e.g. `~/searxng`)

## Initial Server Setup

On the remote server:

```bash
# Create directory
mkdir ~/searxng && cd ~/searxng

# Copy docker-compose.yml, settings.yml, familiada.css here
# Or clone the repo and symlink

# Start
docker compose up -d
```
