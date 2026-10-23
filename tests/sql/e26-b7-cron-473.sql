-- Migracja 473 (E26 B7): gdy zadanie cron nadal woła starą
-- cron_embed_missing_market_games, funkcja i klucze app_config zostają.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql sprzed 473).
\set ON_ERROR_STOP 1
begin;
create table cron.job(jobid bigserial primary key, jobname text, schedule text, command text, active boolean default true);
insert into cron.job(jobname, schedule, command) values ('stare', '*/15 * * * *', 'select public.cron_embed_missing_market_games();');
insert into public.app_config(key, value, note) values ('edge_url', 'https://x.test', null) on conflict (key) do nothing;
\ir ../../supabase/migrations/2026-10-23_473_e26_cleanup_dead_objects.sql
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'cron_embed_missing_market_games') then
    raise exception 'usunięto funkcję wołaną przez cron';
  end if;
  if not exists (select 1 from public.app_config where key = 'edge_url') then
    raise exception 'usunięto klucz app_config mimo zadania cron';
  end if;
end $$;
rollback;
\echo 'e26-b7-cron-473: OK'
