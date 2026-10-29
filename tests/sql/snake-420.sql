-- Migracja 420: ukryta gra w węża -- zapis zdarzeń, postęp zalogowanych,
-- statystyki admina. Uruchomienie: lokalna baza wg docs/sql/local-db.md
-- (schema.sql bez 420), potem z katalogu repo:
--   psql ... -d fam -f tests/sql/snake-420.sql
\set ON_ERROR_STOP 1
begin;
\ir ../../supabase/migrations/2026-10-20_420_snake_easter_egg.sql
insert into auth.users(id, email) values ('00000000-0000-4000-8000-0000000005a1', 'snake@test.local');
insert into public.profiles(id, username, email) values ('00000000-0000-4000-8000-0000000005a1', 'snakefan', 'snake@test.local');

-- anon: zdarzenia bez postępu, wynik przycięty do 300, złe dane odrzucone
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare r jsonb;
begin
  r := public.snake_log('scan', 'visitorAAAA1', null, 'pl');
  if r <> '{"ok": true}'::jsonb then raise exception 'scan anon: %', r; end if;
  perform public.snake_log('enter', 'visitorAAAA1', null, 'pl');
  perform public.snake_log('start', 'visitorAAAA1', null, 'pl');
  perform public.snake_log('finish', 'visitorAAAA1', 9999, 'xx');
  r := public.snake_log('dance', 'visitorAAAA1');
  if r ->> 'error' <> 'invalid' then raise exception 'zły rodzaj: %', r; end if;
  r := public.snake_log('scan', 'bad id!');
  if r ->> 'error' <> 'invalid' then raise exception 'zły visitor: %', r; end if;
  perform public.snake_log('enter', 'e2e-testvisitor', null, 'pl');
end $$;
do $$ begin
  perform 1 from public.snake_events; raise exception 'anon widzi snake_events';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.get_admin_snake_stats(); raise exception 'anon ma statystyki admina';
exception when insufficient_privilege then null; end $$;
reset role;

-- zalogowany: postęp rośnie, best = max
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000005a1', false);
do $$
declare r jsonb;
begin
  r := public.snake_log('enter', 'visitorBBBB2', null, 'uk');
  if r <> '{"ok": true, "best": 0, "games": 0}'::jsonb then raise exception 'enter zalogowany: %', r; end if;
  r := public.snake_log('finish', 'visitorBBBB2', 12, 'uk');
  if (r ->> 'best')::int <> 12 or (r ->> 'games')::int <> 1 then raise exception 'finish 1: %', r; end if;
  r := public.snake_log('finish', 'visitorBBBB2', 5, 'uk');
  if (r ->> 'best')::int <> 12 or (r ->> 'games')::int <> 2 then raise exception 'finish 2: %', r; end if;
end $$;
reset role;

do $$
declare s jsonb; n int;
begin
  select score into n from public.snake_events where visitor = 'visitorAAAA1' and kind = 'finish';
  if n <> 300 then raise exception 'wynik nie przycięty: %', n; end if;
  s := public.get_admin_snake_stats();
  if (s #>> '{kinds,enter,total}')::int <> 2 then raise exception 'enter bez e2e: %', s; end if;
  if (s #>> '{kinds,scan,visitors}')::int <> 1 then raise exception 'scan: %', s; end if;
  if (s #>> '{scores,max}')::int <> 300 then raise exception 'max: %', s; end if;
  if (s ->> 'players')::int <> 1 or s #>> '{top,0,username}' <> 'snakefan' or (s #>> '{top,0,best}')::int <> 12 then raise exception 'top: %', s; end if;
  if jsonb_array_length(s -> 'daily') <> 14 then raise exception 'daily: %', s; end if;
  -- limit zdarzeń na przeglądarkę
  for n in 1..130 loop perform public.snake_log('start', 'visitorCCCC3'); end loop;
  select count(*) into n from public.snake_events where visitor = 'visitorCCCC3';
  if n <> 120 then raise exception 'limit: %', n; end if;
end $$;
select 'snake-420: OK' as wynik;
rollback;
