#!/usr/bin/env bash
# Lokalne zaplecze e2e: Postgres 16 (schema.sql + migracje brancha) i PostgREST.
# Użycie: scripts/agent-tools/local-e2e/setup.sh [migracja.sql ...]
#   bez argumentów: migracje z supabase/migrations nowsze niż origin/main
#   (czyli te z brancha, których nie ma jeszcze w schema.sql).
# Ponowne uruchomienie dokłada tylko podane migracje i przeładowuje PostgREST.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
P=/var/tmp/pgfam
BIN=/usr/lib/postgresql/16/bin
CACHE="$HOME/.cache/familiada-local-e2e"
PSQL=(psql -h "$P" -p 5499 -U postgres -d fam -q -v ON_ERROR_STOP=1)
mkdir -p "$CACHE"

# --- Postgres (docs/sql/local-db.md) ---
if [ ! -d "$P/data" ]; then
  mkdir -p "$P" && chown postgres "$P"
  su postgres -c "$BIN/initdb -D $P/data -A trust -U postgres" >/dev/null
fi
if ! su postgres -c "$BIN/pg_ctl -D $P/data status" >/dev/null 2>&1; then
  su postgres -c "$BIN/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/log start" >/dev/null
  sleep 2
fi
if ! psql -h "$P" -p 5499 -U postgres -lqt | cut -d'|' -f1 | grep -qw fam; then
  psql -h "$P" -p 5499 -U postgres -qc "create database fam"
  psql -h "$P" -p 5499 -U postgres -d fam -q -f "$REPO/docs/sql/local-stubs.sql" >/dev/null
  sed -e 's/"public"\."vector"(384)/real[]/g' -e 's/"p_embedding" "public"\."vector"/"p_embedding" real[]/' \
      -e '/market_games_embedding_ivfflat_idx/d' "$REPO/supabase/schema.sql" > "$P/schema_local.sql"
  # 3 znane błędy (transaction_timeout, schema public, gin_trgm_ops) są nieistotne
  psql -h "$P" -p 5499 -U postgres -d fam -q -f "$P/schema_local.sql" >/dev/null 2>"$P/schema.err" || true
  # jak w Supabase: auth.uid() z claimu PostgREST, domyślne uprawnienia,
  # polityki limitów maili (dane spoza schema.sql)
  "${PSQL[@]}" <<'SQL'
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true),''),
                  nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
SQL
  {
    echo "insert into public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) values"
    grep -o "mail_cooldown_reserve('[^']*'" "$REPO/supabase/schema.sql" | sort -u \
      | sed "s/mail_cooldown_reserve(\('[^']*'\)/(\1,'pair',0,false),/" | sed '$ s/,$//'
    echo "on conflict (action_key) do nothing;"
  } | "${PSQL[@]}"
fi

# --- migracje brancha ---
if [ "$#" -gt 0 ]; then
  MIGS=("$@")
else
  mapfile -t MIGS < <(cd "$REPO" && git diff --name-only --diff-filter=A origin/main -- 'supabase/migrations/*.sql' | sort)
fi
for m in "${MIGS[@]}"; do
  [ -n "$m" ] || continue
  echo "migracja: $m"
  "${PSQL[@]}" -f "$REPO/$m" 2>&1 | grep -v "NOTICE" || true
done

# --- PostgREST i supabase-js (raz, do ~/.cache) ---
if [ ! -x "$CACHE/postgrest" ]; then
  curl -sSL -o "$CACHE/pgrst.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar xf "$CACHE/pgrst.tar.xz" -C "$CACHE"
fi
if [ ! -f "$CACHE/supabase-js/package/dist/umd/supabase.js" ]; then
  mkdir -p "$CACHE/supabase-js"
  (cd "$CACHE/supabase-js" && tar xzf "$(npm pack @supabase/supabase-js@2 --silent | tail -1)")
fi
cat > "$CACHE/pgrst.conf" <<CONF
db-uri = "postgres://postgres@localhost:5499/fam?host=$P"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${LB_SECRET:-local-test-secret-local-test-secret-123456}"
server-port = 3555
db-pool = 5
CONF
if curl -s -o /dev/null localhost:3555/; then
  psql -h "$P" -p 5499 -U postgres -d fam -qc "notify pgrst, 'reload schema'"
else
  (cd "$CACHE" && setsid nohup ./postgrest pgrst.conf > pgrst.log 2>&1 < /dev/null &)
  sleep 2
fi
echo "gotowe: Postgres :5499, PostgREST :3555"
