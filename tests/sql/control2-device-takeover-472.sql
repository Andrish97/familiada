-- Migracja 472: nowe otwarcie urządzenia przejmuje je z dowolnej przeglądarki,
-- wyparta karta nie wraca sama. Uruchomienie: lokalna baza wg docs/sql/local-db.md
-- (schema.sql + migracje), potem: psql ... -d fam -f tests/sql/control2-device-takeover-472.sql
\set ON_ERROR_STOP 1
\set g '47200000-0000-4000-8000-000000000001'
\set owner '47200000-0000-4000-8000-0000000000aa'
begin;
insert into auth.users(id,email) values (:'owner','o472@x.pl');
insert into public.games(id,owner_id,name) values (:'g',:'owner','G472');
select set_config('request.jwt.claim.sub',:'owner',true);
select public.control_runtime_session_touch_v2(:'g')->>'ok' = 'true' as session_ok \gset
select (public.control_runtime_device_link(:'g','display')->>'token') as tok \gset
create temp table r(k text primary key, v jsonb) on commit drop;
grant all on r to anon, authenticated;
set local role anon;
-- A: pierwsza karta (przeglądarka X) zostaje główna.
insert into r select 'a', public.control_device_instance_register(:'g','display',:'tok','47200000-0000-4000-8000-00000000000a','{"browser_context_id":"ctxXXXXXXXX","takeover":true}');
-- B: inna przeglądarka otwiera urządzenie — przejmuje od razu.
insert into r select 'b', public.control_device_instance_register(:'g','display',:'tok','47200000-0000-4000-8000-00000000000b','{"browser_context_id":"ctxYYYYYYYY","takeover":true}');
-- A: heartbeat ze starą epoką — wyparta, nie czeka w kolejce.
insert into r select 'a_hb', public.control_device_instance_heartbeat(:'g','display',:'tok','47200000-0000-4000-8000-00000000000a',
  (select (v->>'epoch')::bigint from r where k='a'),'{}');
-- A ponownie rejestruje ten sam identyfikator — nadal wyparta.
insert into r select 'a_reg', public.control_device_instance_register(:'g','display',:'tok','47200000-0000-4000-8000-00000000000a','{}');
-- C: wybudzona karta rejestruje się bez takeover przy żywej głównej — wyparta.
insert into r select 'c', public.control_device_instance_register(:'g','display',:'tok','47200000-0000-4000-8000-00000000000c','{"browser_context_id":"ctxXXXXXXXX"}');
-- B zwalnia (zamknięcie karty) — nikt nie przejmuje sam.
insert into r select 'b_rel', public.control_device_instance_release(:'g','display',:'tok','47200000-0000-4000-8000-00000000000b',
  (select (v->>'epoch')::bigint from r where k='b'));
insert into r select 'a_hb2', public.control_device_instance_heartbeat(:'g','display',:'tok','47200000-0000-4000-8000-00000000000a',null,'{}');
-- D: rejestracja bez takeover, gdy nikt nie jest główny — przejmuje.
insert into r select 'd', public.control_device_instance_register(:'g','display',:'tok','47200000-0000-4000-8000-00000000000d','{}');
reset role;
do $$
declare a jsonb; b jsonb; ahb jsonb; areg jsonb; c jsonb; ahb2 jsonb; d jsonb;
begin
  select v into a from r where k='a'; select v into b from r where k='b';
  select v into ahb from r where k='a_hb'; select v into areg from r where k='a_reg';
  select v into c from r where k='c'; select v into ahb2 from r where k='a_hb2';
  select v into d from r where k='d';
  if a->>'state'<>'primary' then raise exception 'A powinno być główne: %', a; end if;
  if b->>'state'<>'primary' or (b->>'epoch')::bigint <= (a->>'epoch')::bigint then raise exception 'B (inna przeglądarka) powinno przejąć z nową epoką: % / %', b, a; end if;
  if ahb->>'state'<>'replaced' then raise exception 'A po przejęciu powinno być wyparte: %', ahb; end if;
  if areg->>'state'<>'replaced' then raise exception 'A przy ponownej rejestracji powinno zostać wyparte: %', areg; end if;
  if c->>'state'<>'replaced' then raise exception 'C (bez takeover przy żywej głównej) powinno być wyparte: %', c; end if;
  if ahb2->>'state'<>'replaced' then raise exception 'A nie może wrócić sama po zwolnieniu B: %', ahb2; end if;
  if d->>'state'<>'primary' then raise exception 'D przy braku głównej powinno przejąć: %', d; end if;
  if (select count(*) from public.control_device_connections where game_id='47200000-0000-4000-8000-000000000001' and state='primary')<>1 then
    raise exception 'dokładnie jedna instancja główna';
  end if;
  if (select count(*) from public.control_device_connections where game_id='47200000-0000-4000-8000-000000000001' and state='waiting')<>0 then
    raise exception 'nikt nie czeka w kolejce';
  end if;
  raise notice 'OK 472';
end $$;
rollback;
