#!/usr/bin/env bash
# Uruchamia workflow (workflow_dispatch), czeka na koniec i wypisuje wynik:
# adnotacje przebiegu (::notice -- db-read, maintenance) czytane przez API
# GitHuba. Log pobierany tylko, gdy host z logami jest osiągalny (w środowisku
# agenta bywa zablokowany) -- wtedy podaje job_id do odczytu innym narzędziem.
#
# Użycie:
#   scripts/agent-tools/gh-run.sh db-read.yml sql_file=scripts/db-read/activity-now.sql
#   scripts/agent-tools/gh-run.sh maintenance.yml action=status
#   REF=moj-branch scripts/agent-tools/gh-run.sh e2e-tests.yml spec_filter=e2e/x.spec.js
# Wymaga: GITHUB_TOKEN (actions:write), curl, python3.
set -euo pipefail
WF="${1:?nazwa workflow, np. db-read.yml}"; shift
REPO="${REPO:-Andrish97/familiada}"
REF="${REF:-main}"
# Przebiegi filtrowane po gałęzi: równoległa sesja na innej gałęzi nie podmieni
# numeru przebiegu (wcześniej brany był najnowszy przebieg workflow).
API="https://api.github.com/repos/$REPO"
: "${GITHUB_TOKEN:?GITHUB_TOKEN nie ustawiony}"
H=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")

INPUTS=$(python3 -c 'import json,sys; print(json.dumps(dict(a.split("=",1) for a in sys.argv[1:])))' "$@")
BODY=$(python3 -c 'import json,sys; print(json.dumps({"ref": sys.argv[1], "inputs": json.loads(sys.argv[2])}))' "$REF" "$INPUTS")

LAST=$(curl -s "${H[@]}" "$API/actions/workflows/$WF/runs?per_page=1&event=workflow_dispatch&branch=$REF" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin).get("workflow_runs",[]); print(r[0]["id"] if r else 0)')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${H[@]}" -H "Content-Type: application/json" \
  "$API/actions/workflows/$WF/dispatches" -d "$BODY")
[ "$CODE" = 204 ] || { echo "Uruchomienie odrzucone: HTTP $CODE" >&2; exit 1; }

RUN=0
for _ in $(seq 1 60); do
  RUN=$(curl -s "${H[@]}" "$API/actions/workflows/$WF/runs?per_page=1&event=workflow_dispatch&branch=$REF" \
    | python3 -c 'import json,sys; r=json.load(sys.stdin).get("workflow_runs",[]); print(r[0]["id"] if r else 0)')
  [ "$RUN" != "$LAST" ] && [ "$RUN" != 0 ] && break
  sleep 3
done
[ "$RUN" != "$LAST" ] || { echo "Nie znaleziono nowego przebiegu" >&2; exit 1; }
echo "Przebieg $RUN: https://github.com/$REPO/actions/runs/$RUN" >&2

TIMEOUT="${TIMEOUT:-3600}"; START=$(date +%s); WAITING_SHOWN=
while :; do
  ST=$(curl -s "${H[@]}" "$API/actions/runs/$RUN" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["status"], r.get("conclusion") or "-")')
  [ "${ST%% *}" = completed ] && break
  # środowisko z wymaganym zatwierdzającym (np. maintenance: on/off)
  if [ "${ST%% *}" = waiting ] && [ -z "$WAITING_SHOWN" ]; then
    echo "Czeka na zatwierdzenie właściciela (GitHub → Actions → Review deployments)" >&2; WAITING_SHOWN=1
  fi
  [ $(( $(date +%s) - START )) -gt "$TIMEOUT" ] && { echo "Przekroczony czas oczekiwania ($ST)" >&2; exit 1; }
  sleep 10
done
CONCL="${ST##* }"

for JOB in $(curl -s "${H[@]}" "$API/actions/runs/$RUN/jobs" | python3 -c 'import json,sys; [print(j["id"]) for j in json.load(sys.stdin)["jobs"] if j.get("conclusion") != "skipped"]'); do
  echo "== job $JOB" >&2
  curl -s "${H[@]}" "$API/check-runs/$JOB/annotations" | python3 -c '
import json,sys
for a in json.load(sys.stdin):
    print("[%s] %s" % (a.get("annotation_level"), a.get("title") or ""))
    print(a.get("message") or "")'
  if [ -n "${LOGS:-}" ]; then
    curl -sfL "${H[@]}" "$API/actions/jobs/$JOB/logs" | tail -n "${LOGS}" \
      || echo "(log niedostępny z tego środowiska -- job_id $JOB)" >&2
  fi
done
echo "Wynik: $CONCL" >&2
[ "$CONCL" = success ]
