-- Stan produkcji przed 453 (lokalnie): bucket user-logos i polityka publicznego
-- SELECT z migracji 178/179; storage.foldername jak w Supabase.
\set ON_ERROR_STOP 1
create or replace function storage.foldername(name text) returns text[] language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
insert into storage.buckets(id, name, public) values ('user-logos', 'user-logos', true) on conflict (id) do nothing;
drop policy if exists "user-logos-select" on storage.objects;
create policy "user-logos-select" on storage.objects for select to public using (bucket_id = 'user-logos');
insert into public.example_table(name) values ('e2e'), ('e2e');
