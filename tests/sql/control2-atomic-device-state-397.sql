-- Uwaga: od migracji 472 nikt nie czeka w kolejce przy żywej instancji
-- głównej (stan 'replaced'); ten test opisuje zachowanie sprzed 472.
-- Aktualny test: tests/sql/control2-device-takeover-472.sql.
-- Migracja 397: odblokowanie dźwięku jako cecha instancji Wyświetlacza i
-- jedna migawka stanu urządzeń dla Control.
-- Uruchomienie: lokalna baza wg docs/sql/local-db.md (schema.sql + migracja
-- 397), potem: psql ... -d fam -f tests/sql/control2-atomic-device-state-397.sql
-- Każdy blok rzuca wyjątek, jeśli wynik jest inny niż oczekiwany.
\set ON_ERROR_STOP 1
\set g '39700000-0000-4000-8000-000000000001'
\set owner '39700000-0000-4000-8000-0000000000aa'
begin;
insert into auth.users(id,email) values (:'owner','o397@x.pl');
insert into public.games(id,owner_id,name) values (:'g',:'owner','G397');
select set_config('request.jwt.claim.sub',:'owner',true);
select public.control_runtime_session_touch_v2(:'g')->>'ok' = 'true' as session_ok \gset
select (public.control_runtime_device_link(:'g','display')->>'token') as tok \gset

create temp table r(k text primary key, v jsonb) on commit drop;
grant all on r to anon, authenticated;
set local role anon;
insert into r select 'a', public.control_device_instance_register(:'g','display',:'tok','39700000-0000-4000-8000-00000000000a','{}');
insert into r select 'b', public.control_device_instance_register(:'g','display',:'tok','39700000-0000-4000-8000-00000000000b','{}');
-- Oczekująca instancja nie może zgłosić odblokowania.
insert into r select 'b_hb', public.control_device_instance_heartbeat(:'g','display',:'tok','39700000-0000-4000-8000-00000000000b',null,'{"audio_unlocked":true}');
-- Główna instancja zgłasza odblokowanie.
insert into r select 'a_hb', public.control_device_instance_heartbeat(:'g','display',:'tok','39700000-0000-4000-8000-00000000000a',
  (select (v->>'epoch')::bigint from r where k='a'),'{"audio_unlocked":true,"audio_diagnostic":{"id":"d1"}}');
reset role;
set local role authenticated;
insert into r select 'snap1', public.control_devices_snapshot(:'g');
reset role;
set local role anon;
-- Zwolnienie A: B przejmuje jako nowa instancja bez odblokowania.
insert into r select 'rel', to_jsonb(public.control_device_instance_release(:'g','display',:'tok','39700000-0000-4000-8000-00000000000a',
  (select (v->>'epoch')::bigint from r where k='a')));
insert into r select 'b_hb2', public.control_device_instance_heartbeat(:'g','display',:'tok','39700000-0000-4000-8000-00000000000b',null,'{}');
reset role;
set local role authenticated;
insert into r select 'snap2', public.control_devices_snapshot(:'g');
reset role;

do $$
declare x jsonb;
begin
  if (select v->>'state' from r where k='a')<>'primary' then raise exception 'A should be primary'; end if;
  if (select v->>'state' from r where k='b')<>'waiting' then raise exception 'B should wait'; end if;
  if (select (v->>'audio_unlocked')::boolean from r where k='b_hb') then raise exception 'waiting instance must not unlock'; end if;
  if not (select (v->>'audio_unlocked')::boolean from r where k='a_hb') then raise exception 'primary unlock not stored'; end if;
  x := (select v->'devices'->'display' from r where k='snap1');
  if not (x->>'primary_online')::boolean or not (x->>'audio_unlocked')::boolean then raise exception 'snapshot1 wrong: %', x; end if;
  if (x->>'waiting_count')::int<>1 or x->'meta'->'audio_diagnostic'->>'id'<>'d1' then raise exception 'snapshot1 meta/queue wrong: %', x; end if;
  if (select v->>'state' from r where k='b_hb2')<>'primary' then raise exception 'B should be promoted'; end if;
  x := (select v->'devices'->'display' from r where k='snap2');
  if not (x->>'primary_online')::boolean or (x->>'audio_unlocked')::boolean then raise exception 'snapshot2 must not carry unlock: %', x; end if;
  if (select count(*) from public.device_presence where game_id='39700000-0000-4000-8000-000000000001' and device_id='lease-primary')<>1 then
    raise exception 'one lease-primary presence row expected';
  end if;
  raise notice 'control2-atomic-device-state-397: OK';
end $$;

select set_config('request.jwt.claim.sub','39700000-0000-4000-8000-0000000000bb',true);
set local role authenticated;
do $$ begin
  perform public.control_devices_snapshot('39700000-0000-4000-8000-000000000001');
  raise exception 'stranger read snapshot';
exception when others then
  if sqlerrm<>'forbidden' then raise; end if;
end $$;
reset role;
rollback;
