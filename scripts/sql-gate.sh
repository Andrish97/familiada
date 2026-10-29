#!/usr/bin/env bash
# Bramka SQL przed nałożeniem migracji na produkcję (db-migrate.yml, job sql-gate)
# i lokalnie: tymczasowy Postgres ze schema.sql + podane migracje, potem sondy
# nadużyć (tests/sql/abuse-probes.sql) i fuzzer autoryzacji krzyżowej
# (tests/sql/cross-user-fuzz.sql). Błąd nakładania migracji lokalnie (np. brak
# pg_cron, ról serwera) nie przerywa -- wynik daje tylko test.
# Użycie: PSQL_ADMIN="psql -h ... -U postgres" scripts/sql-gate.sh [migracja.sql ...]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PSQL_ADMIN:?PSQL_ADMIN nie ustawione (np. psql -h /var/tmp/pgfam -p 5499 -U postgres)}"
DB="${SQL_GATE_DB:-fam_gate}"
TMP="$(mktemp -d)"
$PSQL_ADMIN -d postgres -qc "drop database if exists $DB with (force)" -qc "create database $DB"
P() { $PSQL_ADMIN -d "$DB" -q "$@"; }
P -f docs/sql/local-stubs.sql >/dev/null 2>&1
# wektory jak w scripts/agent-tools/local-e2e/setup.sh (bez pgvector)
sed -e 's/"public"\."vector"(384)/real[]/g' -e 's/"p_embedding" "public"\."vector"/"p_embedding" real[]/' \
    -e '/market_games_embedding_ivfflat_idx/d' supabase/schema.sql > "$TMP/schema.sql"
P -f "$TMP/schema.sql" >/dev/null 2>"$TMP/schema.err" || true
P -v ON_ERROR_STOP=1 <<'SQL'
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true),''),
                  nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on all tables in schema public to anon;
SQL
# schema.sql nie ma uprawnień (GRANT/REVOKE), więc powyżej wszystko jest
# nadane; migracje od 514 (blokady nadużyć, powtarzalne) nakładane są zawsze,
# żeby odebrane uprawnienia wróciły, potem nowe migracje z pusha.
MIGS=$( { ls supabase/migrations/*.sql | awk -F/ '$NF >= "2026-10-29_514"'; printf '%s\n' "$@"; } | grep . | sort -u)
for m in $MIGS; do
  echo "migracja: $m"
  P -f "$m" 2>&1 | grep -E "ERROR" | head -3 || true
done
rc=0
for t in tests/sql/abuse-probes.sql tests/sql/cross-user-fuzz.sql; do
  if P -v ON_ERROR_STOP=1 -f "$t" > "$TMP/out" 2>&1; then
    echo "OK: $t"
  else
    rc=1; echo "BŁĄD: $t"; grep -v "WARNING" "$TMP/out" | tail -40
    [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error title=sql-gate::$t: $(grep -m1 'ERROR' "$TMP/out" | tr '\n' ' ' | head -c 400)"
  fi
done
$PSQL_ADMIN -d postgres -qc "drop database if exists $DB with (force)"
rm -rf "$TMP"
exit $rc
