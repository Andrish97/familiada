-- Migracja 491: import przejrzanych kontaktów i lista kategorii z licznikami.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + 490 + 491).
\set ON_ERROR_STOP 1
begin;
insert into public.marketing_categories(id, name) values ('49100000-0000-4000-8000-0000000000c1', 'DJ');
insert into public.marketing_verified_contacts(id, email, url, title) values
  ('49100000-0000-4000-8000-000000000001', 'a@a.pl', 'https://a.pl', 'A'),
  ('49100000-0000-4000-8000-000000000002', 'b@b.pl', 'https://b.pl', 'B'),
  ('49100000-0000-4000-8000-000000000003', 'c@c.pl', 'https://c.pl', 'C');
do $$ declare r jsonb; begin
  r := public.marketing_import_contacts('[
    {"id":"49100000-0000-4000-8000-000000000001","decision":"keep","name":"DJ Adam","category":" dj "},
    {"id":"49100000-0000-4000-8000-000000000002","decision":"delete"},
    {"id":"49100000-0000-4000-8000-000000000003","decision":"","category":"Wodzireje"},
    {"id":"nie-uuid","decision":"delete"}
  ]'::jsonb);
  if r <> '{"updated":2,"deleted":1,"categories":1}'::jsonb then raise exception 'import: %', r; end if;
  if (select (title, quality) from public.marketing_verified_contacts where id = '49100000-0000-4000-8000-000000000001')
     is distinct from ('DJ Adam'::text, 'good'::text) then raise exception 'keep: zły stan'; end if;
  if (select category_id from public.marketing_verified_contacts where id = '49100000-0000-4000-8000-000000000001') <> '49100000-0000-4000-8000-0000000000c1' then
    raise exception 'kategoria po nazwie bez wielkości liter'; end if;
  if exists (select 1 from public.marketing_verified_contacts where id = '49100000-0000-4000-8000-000000000002') then raise exception 'delete nie usunął'; end if;
  if (select c.name from public.marketing_verified_contacts v join public.marketing_categories c on c.id = v.category_id where v.id = '49100000-0000-4000-8000-000000000003') <> 'Wodzireje' then
    raise exception 'nowa kategoria nie przypisana'; end if;
  if (select contacts from public.marketing_categories_list() where name = 'DJ') <> 1 then raise exception 'licznik kategorii'; end if;
  if has_function_privilege('anon', 'public.marketing_import_contacts(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.marketing_categories_list()', 'execute') then
    raise exception 'funkcje 491 dostępne przez API'; end if;
end $$;
rollback;
\echo 'marketing-import-491: OK'
