# Supabase DB schema

## Source of truth
- supabase/migrations/*.sql — historia zmian
- supabase/schema.sql — aktualna struktura bazy (snapshot)

## Bootstrap
- supabase/migrations/00000000000000_init.sql to stan początkowy bazy
- nie edytujemy starych migracji

## Workflow zmian
1) dodaj nową migrację SQL
2) uruchom ją w Supabase SQL Editor
3) zaktualizuj schema.sql
4) commit

## Safety
- bez sekretów
- RLS wymagane dla tabel userów
