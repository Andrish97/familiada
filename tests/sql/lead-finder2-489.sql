-- Migracja 489: Lead Finder 2 — wysyłka, reakcje, lista do pominięcia, liczniki, prawa.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracja 489).
\set ON_ERROR_STOP 1
begin;
insert into public.marketing_verified_contacts(email, url, title) values
  ('DJ.Marek@gmail.com', 'https://djmarek.pl', 'DJ Marek'),
  ('biuro@wodzirej.pl', 'https://wodzirej.pl', 'Wodzirej'),
  ('kontakt@agencja.pl', 'https://agencja.pl', 'Agencja');
do $$ declare n int; r record; begin
  n := public.marketing_mark_sent(array['dj.marek@gmail.com', 'biuro@wodzirej.pl', 'nieznany@x.pl']);
  if n <> 2 then raise exception 'mark_sent: oczekiwano 2, jest %', n; end if;
  perform public.marketing_mark_sent(array['dj.marek@gmail.com']);
  select sent_count, is_used, last_sent_at is not null as d into r from public.marketing_verified_contacts where email = 'DJ.Marek@gmail.com';
  if r.sent_count <> 2 or not r.is_used or not r.d then raise exception 'mark_sent: zły stan %', r; end if;

  n := public.marketing_mark_reaction(' dj.marek@GMAIL.com ', 'declined');
  if n <> 1 then raise exception 'reaction declined: oczekiwano 1, jest %', n; end if;
  n := public.marketing_mark_reaction('dj.marek@gmail.com', 'replied');
  if n <> 0 then raise exception 'replied nadpisało declined'; end if;
  n := public.marketing_mark_reaction('biuro@wodzirej.pl', 'replied');
  n := public.marketing_mark_reaction('biuro@wodzirej.pl', 'bounced');
  if (select reaction from public.marketing_verified_contacts where email = 'biuro@wodzirej.pl') <> 'bounced' then
    raise exception 'bounced nie nadpisało replied';
  end if;
  begin
    perform public.marketing_mark_reaction('x@y.pl', 'opened');
    raise exception 'nieznana reakcja przyjęta';
  exception when others then
    if sqlerrm not like 'marketing_mark_reaction:%' then raise; end if;
  end;

  if (select array_agg(e order by e) from public.marketing_send_blocked(array['DJ.MAREK@gmail.com','biuro@wodzirej.pl','kontakt@agencja.pl']) e)
     <> array['biuro@wodzirej.pl','dj.marek@gmail.com'] then
    raise exception 'send_blocked: zła lista';
  end if;

  select * into r from public.marketing_contact_counts();
  if (r.total, r.sent, r.declined, r.bounced, r.unreviewed) <> (3, 2, 1, 1, 3) then raise exception 'counts: %', r; end if;

  insert into public.marketing_candidates(source, source_ref, emails) values ('search', 'https://a.pl', array['a@a.pl']);
  begin
    insert into public.marketing_candidates(source, source_ref) values ('search', 'https://a.pl');
    raise exception 'duplikat kandydata przyjęty';
  exception when unique_violation then null; end;

  if has_table_privilege('anon', 'public.marketing_candidates', 'select')
     or has_table_privilege('authenticated', 'public.marketing_run_stats', 'select')
     or has_function_privilege('anon', 'public.marketing_mark_reaction(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.marketing_send_blocked(text[])', 'execute')
     or has_function_privilege('anon', 'public.marketing_contact_counts()', 'execute') then
    raise exception 'tabele/funkcje 489 dostępne przez API';
  end if;
  if exists (select 1 from pg_roles where rolname = 'agent_reader')
     and not has_table_privilege('agent_reader', 'public.marketing_run_stats', 'select') then
    raise exception 'agent_reader bez odczytu marketing_run_stats';
  end if;
end $$;
rollback;
\echo 'lead-finder2-489: OK'
