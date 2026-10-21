-- Migracja 445: koniec publicznego odczytu profiles/app_ratings/device_connect_codes,
-- zamienniki (_public_username, username_taken, poll_go_owner_email_match).
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracja 445).
\set ON_ERROR_STOP 1
begin;
\set a '44500000-0000-4000-8000-00000000000a'
\set b '44500000-0000-4000-8000-00000000000b'
insert into auth.users(id,email) values (:'a','a445@example.com'),(:'b','b445@example.com');
insert into public.profiles(id,username,email) values (:'a','alicja445','a445@example.com'),(:'b','Bartek445','b445@example.com') on conflict (id) do nothing;
insert into public.market_games(author_user_id,title,lang,payload,status) values (:'b','Gra 445','pl','{}'::jsonb,'published');
insert into public.app_ratings(user_id,stars,comment) values (:'a',5,'A'),(:'b',4,'B');
insert into public.device_connect_codes(code,owner_id,device_type,share_key) values ('C445',:'b','display','sekret445');
-- schemat lokalny nie ma GRANT-ów tabel: jak na produkcji (Supabase)
grant select, insert, update on public.profiles, public.app_ratings, public.device_connect_codes, public.market_games to authenticated;
grant select on public.profiles, public.app_ratings, public.device_connect_codes, public.market_games to anon;
grant usage on schema auth to authenticated, anon;
grant select on all tables in schema public to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
select set_config('request.jwt.claim.sub', :'a', true);
set local role authenticated;
do $$ declare n int; t text; begin
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'profiles: widać % profili zamiast własnego', n; end if;
  select count(*) into n from public.app_ratings;
  if n <> 1 then raise exception 'app_ratings: widać % ocen zamiast własnej', n; end if;
  select count(*) into n from public.device_connect_codes;
  if n <> 0 then raise exception 'device_connect_codes: widać cudze kody (%)', n; end if;
  if not public.username_taken('bartek445') then raise exception 'username_taken: zajęta nazwa wolna'; end if;
  if public.username_taken('Alicja445') then raise exception 'username_taken: własna nazwa zajęta'; end if;
  if public.username_taken('nikt445') then raise exception 'username_taken: wolna nazwa zajęta'; end if;
  t := public.poll_go_owner_email_match('44500000-0000-4000-8000-00000000000b', ' B445@example.com ');
  if t is distinct from 'Bartek445' then raise exception 'owner_email_match: %', t; end if;
  if public.poll_go_owner_email_match('44500000-0000-4000-8000-00000000000b', 'a445@example.com') is not null then raise exception 'owner_email_match: obcy e-mail'; end if;
  select author_username into t from public.market_browse('pl', '', 10, 0) where title = 'Gra 445';
  if t is distinct from 'Bartek445' then raise exception 'market_browse: autor %', t; end if;
  select avg_stars::text into t from public.get_app_rating_stats();
  if t is null then raise exception 'get_app_rating_stats'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'anon profiles: %', n; end if;
  select count(*) into n from public.device_connect_codes;
  if n <> 0 then raise exception 'anon device_connect_codes: %', n; end if;
  raise notice 'close-public-reads-445: OK';
end $$;
rollback;
