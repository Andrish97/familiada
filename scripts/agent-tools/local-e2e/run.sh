#!/usr/bin/env bash
# Spec e2e na lokalnym zapleczu (najpierw setup.sh). Argumenty idą do Playwrighta:
#   scripts/agent-tools/local-e2e/run.sh e2e/base-explorer.spec.js --grep "kosz"
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../../../tests"
export NODE_OPTIONS="--require $HERE/preload.cjs" E2E_BYPASS_SECRET=local TEST_PASSWORD=local
exec npx playwright test "$@"
