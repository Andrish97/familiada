-- Migracje 446/447: tabele tylko dla klucza serwisowego (audyt E24).
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracje 446, 447).
\set ON_ERROR_STOP 1
do $$ declare t text; r text; begin
  foreach t in array array['example_table','konta_do_stworzenia','schema_migrations','stats_excluded_users','email_providers',
    'public_kv','marketing_cities','marketing_raw_contacts','marketing_search_queries_log','marketing_ai_providers',
    'marketing_search_logs','marketing_verified_contacts','stats_exclusions_effective'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE') then
        raise exception '%: % ma jeszcze prawa', t, r;
      end if;
    end loop;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception '%: zostały polityki', t;
    end if;
  end loop;
  raise notice 'service-only-tables-446: OK';
end $$;
-- Funkcje SECURITY DEFINER korzystające z tych tabel działają dalej dla anon.
begin;
grant usage on schema public to anon;
set local role anon;
select count(*) >= 0 as ok from public.get_app_rating_stats();
reset role;
rollback;
