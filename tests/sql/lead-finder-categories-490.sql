-- Migracja 490: kategorie Lead Findera, dopasowanie starych wysyłek i odpowiedzi.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql), migracja wykonywana w teście.
\set ON_ERROR_STOP 1
begin;
insert into public.marketing_verified_contacts(id, email, url, title, is_used) values
  ('49000000-0000-4000-8000-000000000001', 'DJ@max.pl', 'https://max.pl', 'DJ Max', false),
  ('49000000-0000-4000-8000-000000000002', 'biuro@used.pl', 'https://used.pl', 'Użyty', true),
  ('49000000-0000-4000-8000-000000000003', 'nowy@x.pl', 'https://x.pl', 'Nowy', false),
  ('49000000-0000-4000-8000-000000000004', 'cisza@y.pl', 'https://y.pl', 'Cisza', true);
insert into public.messages(direction, to_email, from_email, subject, is_marketing, created_at) values
  ('outbound', 'dj@max.pl', 'kontakt@familiada.online', 'Oferta', true, '2026-09-01'),
  ('outbound', 'dj@max.pl', 'kontakt@familiada.online', 'Oferta 2', true, '2026-10-01'),
  ('outbound', 'cisza@y.pl', 'kontakt@familiada.online', 'Oferta', true, '2026-09-01'),
  ('inbound', 'kontakt@familiada.online', 'dj@max.pl', 'Re: Oferta', false, '2026-09-02'),
  ('inbound', 'kontakt@familiada.online', 'cisza@y.pl', 'Pytanie', false, '2026-08-01'),
  ('inbound', 'kontakt@familiada.online', 'nowy@x.pl', 'Re: x', true, '2026-09-03');
\i supabase/migrations/2026-10-25_490_lead_finder_categories.sql
do $$ declare r record; begin
  for r in select title, sent_count, is_used, last_sent_at, reaction from public.marketing_verified_contacts where id::text like '49000000%' order by id loop
    raise notice '%', r;
  end loop;
  if (select (sent_count, is_used, last_sent_at::date, reaction) from public.marketing_verified_contacts where title = 'DJ Max')
     <> (2, true, '2026-10-01'::date, 'replied'::text) then raise exception 'DJ Max: zła wysyłka/odpowiedź'; end if;
  if (select (sent_count, last_sent_at, reaction) from public.marketing_verified_contacts where title = 'Użyty')
     is distinct from (1, null::timestamptz, null::text) then raise exception 'Użyty: oczekiwano sent_count=1 bez daty'; end if;
  if (select (sent_count, reaction) from public.marketing_verified_contacts where title = 'Nowy')
     is distinct from (0, null::text) then raise exception 'Nowy: bez wysyłki nie ma odpowiedzi'; end if;
  if (select reaction from public.marketing_verified_contacts where title = 'Cisza') is not null then
    raise exception 'Cisza: wiadomość sprzed wysyłki to nie odpowiedź'; end if;

  insert into public.marketing_categories(name) values ('DJ');
  begin
    insert into public.marketing_categories(name) values (' dj ');
    raise exception 'duplikat nazwy kategorii przyjęty';
  exception when unique_violation then null; end;
  update public.marketing_verified_contacts set category_id = (select id from public.marketing_categories where name = 'DJ') where title = 'DJ Max';
  delete from public.marketing_categories where name = 'DJ';
  if (select category_id from public.marketing_verified_contacts where title = 'DJ Max') is not null then raise exception 'usunięta kategoria nie odpięta'; end if;
  if has_table_privilege('anon', 'public.marketing_categories', 'select') or has_table_privilege('authenticated', 'public.marketing_categories', 'insert') then
    raise exception 'marketing_categories dostępne przez API'; end if;
end $$;
rollback;
\echo 'lead-finder-categories-490: OK'
