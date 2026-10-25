-- Migracja 493: DeepSeek jedynym włączonym dostawcą Lead Findera.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + 493).
\set ON_ERROR_STOP 1
begin;
delete from public.marketing_ai_providers;
insert into public.marketing_ai_providers(name, label, priority, is_active) values
  ('groq', 'Groq', 0, true), ('deepseek', 'DeepSeek', 2, false), ('anthropic', 'Anthropic', 1, true);
update public.marketing_ai_providers set cooldown_until = now() + interval '1 hour' where name = 'deepseek';
\i supabase/migrations/2026-10-25_493_lead_finder_deepseek_only.sql
do $$ begin
  if (select array_agg(name order by name) from public.marketing_ai_providers where is_active) <> array['deepseek'] then
    raise exception 'włączony powinien być tylko deepseek';
  end if;
  if (select cooldown_until from public.marketing_ai_providers where name = 'deepseek') is null then
    raise exception 'cooldown deepseeka nie może zniknąć';
  end if;
  delete from public.marketing_ai_providers;
end $$;
\i supabase/migrations/2026-10-25_493_lead_finder_deepseek_only.sql
do $$ begin
  if (select count(*) from public.marketing_ai_providers where name = 'deepseek' and is_active) <> 1 then
    raise exception 'brak wiersza deepseek po migracji na pustej tabeli';
  end if;
end $$;
rollback;
\echo 'lead-finder-deepseek-493: OK'
