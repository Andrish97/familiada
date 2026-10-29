-- Nazwy tagów i folderów baz pytań a ograniczenia serwera (migracja 515): same liczby.
select
  (select count(*) from public.qb_tags where char_length(name) > 40) as tags_over_40,
  (select count(*) from public.qb_tags where name !~ '^[a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$') as tags_bad_chars,
  (select count(*) from public.qb_tags) as tags_all,
  (select count(*) from public.qb_categories where char_length(coalesce(name, '')) > 80) as folders_over_80,
  (select count(*) from public.qb_categories) as folders_all
