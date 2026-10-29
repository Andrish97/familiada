-- Test lokalny migracji 461 (E25: panel admina bez danych z kont testowych).
-- Po schemacie, 460 i 461: psql ... -v ON_ERROR_STOP=1 -f docs/sql/test-admin-hide-test-data-461.sql
\set ON_ERROR_STOP on
BEGIN;
insert into auth.users(id,email,raw_app_meta_data) values
 ('46100000-0000-4000-8000-0000000000e1','e2e+standard07@familiada.online','{"e2e_role":"standard"}'),
 ('46100000-0000-4000-8000-0000000000a1','prawdziwy461@example.com','{}'),
 ('46100000-0000-4000-8000-0000000000b1','wlasciciel461@example.com','{}');
insert into public.profiles(id,email,username) values
 ('46100000-0000-4000-8000-0000000000e1','e2e+standard07@familiada.online','e2e.standard07'),
 ('46100000-0000-4000-8000-0000000000a1','prawdziwy461@example.com','prawdziwy461'),
 ('46100000-0000-4000-8000-0000000000b1','wlasciciel461@example.com','wlasciciel461')
 on conflict (id) do update set email=excluded.email, username=excluded.username;
select public.e2e_identity_bind('e2e.standard07','46100000-0000-4000-8000-0000000000e1');
-- ręczne wykluczenie prawdziwego konta: dalej widoczne w listach panelu
insert into public.stats_excluded_users(user_id) values ('46100000-0000-4000-8000-0000000000b1');

insert into public.market_games(id,author_user_id,title,lang,payload,status) values
 ('46100000-0000-4000-8000-00000000c0e1','46100000-0000-4000-8000-0000000000e1','E2E-MKT-461','pl','{}','pending'),
 ('46100000-0000-4000-8000-00000000c0a1','46100000-0000-4000-8000-0000000000a1','Prawdziwa 461','pl','{}','pending'),
 ('46100000-0000-4000-8000-00000000c0b1','46100000-0000-4000-8000-0000000000b1','Właściciela 461','pl','{}','pending');
insert into public.market_game_ratings(market_game_id,user_id,stars) values
 ('46100000-0000-4000-8000-00000000c0a1','46100000-0000-4000-8000-0000000000e1',1),
 ('46100000-0000-4000-8000-00000000c0a1','46100000-0000-4000-8000-0000000000b1',5);
insert into public.messages(id,direction,from_email,to_email,subject,body) values
 ('46100000-0000-4000-8000-00000000d0e1','inbound','e2e+standard07@familiada.online','kontakt@familiada.online','Test 461','x'),
 ('46100000-0000-4000-8000-00000000d0e3','outbound','kontakt@familiada.online','e2e+noaccount01@familiada.online','Odp 461','x'),
 ('46100000-0000-4000-8000-00000000d0a1','inbound','prawdziwy461@example.com','kontakt@familiada.online','Pytanie 461','x');

do $$ declare n int; begin
  select count(*) into n from public.market_admin_list('pending') where title like '%461%';
  if n <> 2 then raise exception '461: market_admin_list % (oczekiwane 2)', n; end if;
  if exists (select 1 from public.market_admin_list('pending') where title = 'E2E-MKT-461') then raise exception '461: testowa gra widoczna'; end if;
  select rating_count into n from public.market_games where id='46100000-0000-4000-8000-00000000c0a1';
  if n <> 1 then raise exception '461: rating_count % (bez oceny testowej 1)', n; end if;
  if (select avg_rating from public.market_games where id='46100000-0000-4000-8000-00000000c0a1') <> 5 then raise exception '461: avg_rating'; end if;
  select count(*) into n from public.list_messages('inbox', 500, 0) where subject like '%461%';
  if n <> 1 then raise exception '461: inbox % (oczekiwane 1)', n; end if;
  select count(*) into n from public.list_messages('sent', 500, 0) where subject like '%461%';
  if n <> 0 then raise exception '461: sent do testowego %', n; end if;
  if not public.is_test_email('E2E+noaccount05@familiada.online') or public.is_test_email('test9@familiada.online')
     or public.is_test_email('prawdziwy461@example.com') or public.is_test_email('wlasciciel461@example.com') or public.is_test_email(null)
    then raise exception '461: is_test_email'; end if;
end $$;

select '461 OK' as result;
ROLLBACK;
