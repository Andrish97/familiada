-- Uwaga: od migracji 472 nikt nie czeka w kolejce przy żywej instancji
-- głównej (stan 'replaced'); ten test opisuje zachowanie sprzed 472.
-- Aktualny test: tests/sql/control2-device-takeover-472.sql.
-- Migracja 423: nowa karta tej samej przeglądarki przejmuje urządzenie.
-- Uruchomienie: lokalna baza wg docs/sql/local-db.md (schema.sql + migracje),
-- potem: psql ... -d fam -f tests/sql/control2-same-browser-takeover-423.sql
\set ON_ERROR_STOP 1
\set g '42300000-0000-4000-8000-000000000001'
\set owner '42300000-0000-4000-8000-0000000000aa'
begin;
insert into auth.users(id,email) values (:'owner','o423@x.pl');
insert into public.games(id,owner_id,name) values (:'g',:'owner','G423');
select set_config('request.jwt.claim.sub',:'owner',true);
select public.control_runtime_session_touch_v2(:'g')->>'ok' = 'true' as session_ok \gset
select (public.control_runtime_device_link(:'g','buzzer')->>'token') as tok \gset
create temp table r(k text primary key, v jsonb) on commit drop;
grant all on r to anon, authenticated;
set local role anon;
-- A: pierwsza karta (przeglądarka X) zostaje główna.
insert into r select 'a', public.control_device_instance_register(:'g','buzzer',:'tok','42300000-0000-4000-8000-00000000000a','{"browser_context_id":"ctxXXXXXXXX","takeover":true}');
-- C: inna przeglądarka z flagą — czeka.
insert into r select 'c', public.control_device_instance_register(:'g','buzzer',:'tok','42300000-0000-4000-8000-00000000000c','{"browser_context_id":"ctxYYYYYYYY","takeover":true}');
-- D: ta sama przeglądarka bez flagi (ponowna rejestracja) — czeka.
insert into r select 'd', public.control_device_instance_register(:'g','buzzer',:'tok','42300000-0000-4000-8000-00000000000d','{"browser_context_id":"ctxXXXXXXXX"}');
-- B: nowa karta przeglądarki X z flagą — przejmuje od razu.
insert into r select 'b', public.control_device_instance_register(:'g','buzzer',:'tok','42300000-0000-4000-8000-00000000000b','{"browser_context_id":"ctxXXXXXXXX","takeover":true}');
-- A po przejęciu: heartbeat ze starą epoką → oczekuje (nie wygasa).
insert into r select 'a_hb', public.control_device_instance_heartbeat(:'g','buzzer',:'tok','42300000-0000-4000-8000-00000000000a',
  (select (v->>'epoch')::bigint from r where k='a'),'{}');
reset role;
do $$
declare a jsonb; b jsonb; c jsonb; d jsonb; ahb jsonb;
begin
  select v into a from r where k='a'; select v into b from r where k='b';
  select v into c from r where k='c'; select v into d from r where k='d';
  select v into ahb from r where k='a_hb';
  if a->>'state'<>'primary' then raise exception 'A powinno być główne: %', a; end if;
  if c->>'state'<>'waiting' then raise exception 'C (inna przeglądarka) powinno czekać: %', c; end if;
  if d->>'state'<>'waiting' then raise exception 'D (bez flagi) powinno czekać: %', d; end if;
  if b->>'state'<>'primary' or (b->>'epoch')::bigint <= (a->>'epoch')::bigint then raise exception 'B powinno przejąć z nową epoką: % / %', b, a; end if;
  if ahb->>'state'<>'waiting' then raise exception 'A po przejęciu powinno czekać: %', ahb; end if;
  if (select count(*) from public.control_device_connections where game_id='42300000-0000-4000-8000-000000000001' and state='primary')<>1 then
    raise exception 'dokładnie jedna instancja główna';
  end if;
  raise notice 'OK 423';
end $$;
rollback;
