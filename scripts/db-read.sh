#!/usr/bin/env bash
# Odczyt produkcyjnej bazy bez migracji (workflow db-read.yml).
# Repozytorium jest publiczne, więc wynik trafia do publicznego logu Actions:
#  * plik tylko z scripts/db-read/, jedno zapytanie SELECT bez ";" i "\"
#    (owinięte w podzapytanie -- druga instrukcja ani komenda psql nie przejdzie);
#  * sesja i transakcja READ ONLY, limit 60 s, najwyżej 1000 wierszy;
#  * w workflow połączenie jako rola agent_reader (migracja 414): SELECT tylko
#    na wybranych tabelach, bez auth/profili/poczty, nie superużytkownik;
#  * przed wykonaniem \gdesc: kolumny wyniku tylko liczby, wartości logiczne,
#    UUID i daty -- tekst/JSON (treści, nazwy, e-maile) przerywa odczyt.
# Użycie: PSQL_CMD="psql -h ... -d ..." scripts/db-read.sh scripts/db-read/nazwa.sql
set -euo pipefail
FILE="${1:-}"
if [[ ! "$FILE" =~ ^scripts/db-read/[a-z0-9][a-z0-9-]*\.sql$ ]]; then
  echo "Dozwolone tylko pliki scripts/db-read/<nazwa>.sql (podano: '$FILE')" >&2; exit 2
fi
[ -f "$FILE" ] || { echo "Brak pliku $FILE" >&2; exit 2; }
: "${PSQL_CMD:?PSQL_CMD nie ustawione}"

# zapytanie bez końcowego średnika
Q=$(python3 -c 'import sys; print(open(sys.argv[1], encoding="utf-8").read().rstrip().rstrip(";").rstrip())' "$FILE")
# jedna instrukcja: bez średników (zamknięcie transakcji, druga instrukcja)
# i bez "\" (komendy psql, w tym powłoka)
case "$Q" in
  *';'*|*'\'*) echo "Zapytanie nie może zawierać ';' ani '\\' (jedno zapytanie SELECT)." >&2; exit 2 ;;
esac
psql_run() { bash -c "$PSQL_CMD -X -v ON_ERROR_STOP=1 -q $1" 2> >(tee /tmp/db-read.err >&2); }
# W Actions błąd bazy także jako adnotacja (czytelna przez gh-run.sh).
trap 'rc=$?; if [ $rc -ne 0 ] && [ -n "${GITHUB_ACTIONS:-}" ] && [ -s /tmp/db-read.err ]; then echo "::error title=db-read::$(head -c 500 /tmp/db-read.err | tr "\n" " ")"; fi' EXIT

DESC=$(printf 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;\nBEGIN READ ONLY;\nSELECT * FROM (\n%s\n) _q\n\\gdesc\nROLLBACK;\n' "$Q" | psql_run "-At")
ALLOWED='^(smallint|integer|bigint|numeric(\(.*\))?|real|double precision|boolean|uuid|date|time.*|timestamp.*|interval)(\[\])?$'
BAD=0
while IFS='|' read -r col typ; do
  [ -z "$col" ] && continue
  if [[ ! "$typ" =~ $ALLOWED ]]; then echo "Kolumna '$col' typu '$typ' niedozwolona (tylko liczby, bool, uuid, daty)." >&2; BAD=1; fi
done <<< "$DESC"
[ "$BAD" = 0 ] || exit 3

# DB_READ_TUPLES=1: same wiersze, pola rozdzielone "|" (dla skryptów)
FMT="-P pager=off"
[ "${DB_READ_TUPLES:-}" = 1 ] && FMT="-At"
OUT=$(printf "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;\nBEGIN READ ONLY;\nSET LOCAL statement_timeout = '60s';\nSELECT * FROM (\n%s\n) _q LIMIT 1000;\nROLLBACK;\n" "$Q" | psql_run "$FMT")
printf '%s\n' "$OUT"
# W Actions wynik także jako adnotacja przebiegu -- czytelna przez API
# (scripts/agent-tools/gh-run.sh), gdy pobranie logu jest zablokowane.
if [ -n "${GITHUB_ACTIONS:-}" ] && [ -z "${DB_READ_NO_NOTICE:-}" ]; then
  MSG=$(printf '%s' "$OUT" | python3 -c 'import sys; print(sys.stdin.read().replace("%","%25").replace("\r","%0D").replace("\n","%0A"), end="")')
  echo "::notice title=db-read::$MSG"
fi
