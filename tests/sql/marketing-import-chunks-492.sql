-- Migracja 492: import 1500 kontaktów w dwóch porcjach w jednej transakcji
-- (jak polecenie importu właściciela). Lokalna baza: schema.sql + 490–492.
\set ON_ERROR_STOP 1
begin;
delete from public.marketing_verified_contacts;
delete from public.marketing_categories;
insert into public.marketing_verified_contacts(id, email, url, title, sent_count)
select ('49200000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'k' || g || '@x.pl', 'https://x' || g || '.pl', 'K' || g, 1
  from generate_series(1, 1500) g;
create temp table imp as
select id::text, title as name, (case when right(email, 6) like '%7@x.pl' then 'usuń' else 'zostaw' end) as decision,
       (case when (row_number() over (order by id)) % 2 = 0 then 'DJ' else 'Wodzireje' end) as category
  from public.marketing_verified_contacts;
do $$ declare r jsonb; tot jsonb := '{"updated":0,"deleted":0,"categories":0}'; begin
  for r in
    select public.marketing_import_contacts(jsonb_agg(jsonb_build_object('id', id, 'decision', d, 'name', name, 'category', category)))
      from (select *, case when decision = 'usuń' then 'delete' else 'keep' end d, (row_number() over () - 1) / 1000 as chunk from imp) x
     group by chunk
  loop
    tot := jsonb_build_object('updated', (tot->>'updated')::int + (r->>'updated')::int, 'deleted', (tot->>'deleted')::int + (r->>'deleted')::int,
                              'categories', (tot->>'categories')::int + (r->>'categories')::int);
  end loop;
  if tot <> '{"updated":1350,"deleted":150,"categories":2}'::jsonb then raise exception 'import w porcjach: %', tot; end if;
  if (select count(*) from public.marketing_verified_contacts) <> 1350 then raise exception 'liczba po imporcie'; end if;
  if exists (select 1 from public.marketing_verified_contacts where sent_count <> 1) then raise exception 'wysyłki zgubione'; end if;
end $$;
rollback;
\echo 'marketing-import-chunks-492: OK'
