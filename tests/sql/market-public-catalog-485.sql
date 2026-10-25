-- Kontrakt dodającego RPC. Fixture lokalny lub transakcja rollback na bazie testowej.
begin;
insert into public.market_games(id,slug,title,description,lang,origin,status)
select md5('public-catalog-485-' || n)::uuid, 'public-catalog-485-'||n,
  'Public catalogue fixture', 'Description', 'pl', 'community', 'published'
from generate_series(1,105) n;
insert into public.market_games(id,slug,title,description,lang,origin,status)
select md5('private-catalog-485-' || n)::uuid, 'private-catalog-485-'||n,
  'Private fixture', 'Private', 'pl', 'community', s::public.market_game_status
from unnest(array['pending','rejected','withdrawn']) with ordinality as t(s,n);
set local role anon;
do $$
begin
 if (select count(*) from public.market_public_catalog() where slug like 'public-catalog-485-%') <> 105 then
   raise exception 'catalogue truncated';
 end if;
 if exists(select 1 from public.market_public_catalog() where slug like 'private-catalog-485-%') then
   raise exception 'private entry leaked';
 end if;
 if (select count(*) from jsonb_object_keys(to_jsonb((select r from public.market_public_catalog() r limit 1)) ) as k where k in ('author_email','moderation_note','payload','user_stars','in_library')) <> 0 then
   raise exception 'private fields leaked';
 end if;
end $$;
reset role;
update public.market_games set status='withdrawn' where slug='public-catalog-485-1';
set local role anon;
do $$ begin
 if exists(select 1 from public.market_public_catalog() where slug='public-catalog-485-1') then raise exception 'withdrawal still public'; end if;
end $$;
reset role;
delete from public.market_games where slug='public-catalog-485-2';
set local role anon;
do $$ begin
 if exists(select 1 from public.market_public_catalog() where slug='public-catalog-485-2') then raise exception 'deletion still public'; end if;
end $$;
reset role;
rollback;
