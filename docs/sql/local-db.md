# Testowa baza lokalna (Postgres 16 w kontenerze)

Do sprawdzania migracji przed wypchnięciem na `main`:

```sh
P=/var/tmp/pgfam; BIN=/usr/lib/postgresql/16/bin
mkdir -p $P && chown postgres $P
su postgres -c "$BIN/initdb -D $P/data -A trust -U postgres"
su postgres -c "$BIN/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/log start"
psql -h $P -p 5499 -U postgres -c "create database fam"
psql -h $P -p 5499 -U postgres -d fam -f docs/sql/local-stubs.sql
# schema.sql bez pgvector:
sed -e 's/"public"\."vector"(384)/real[]/g' -e 's/"p_embedding" "public"\."vector"/"p_embedding" real[]/' \
    -e '/market_games_embedding_ivfflat_idx/d' supabase/schema.sql > $P/schema_local.sql
psql -h $P -p 5499 -U postgres -d fam -f $P/schema_local.sql
psql -h $P -p 5499 -U postgres -d fam -v ON_ERROR_STOP=1 -f supabase/migrations/<nowa>.sql
```

Użytkownika symuluje się przez `set role authenticated` i
`select set_config('request.jwt.claim.sub','<uuid>',false)` (`auth.uid()` ze stubów).
