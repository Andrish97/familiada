-- Migracja 421: limit wyniku węża 2000 (bonusy). Lokalna baza wg
-- docs/sql/local-db.md (bez 420/421 -- test stosuje obie w transakcji): psql ... -f tests/sql/snake-bonus-421.sql
\set ON_ERROR_STOP 1
begin;
\ir ../../supabase/migrations/2026-10-20_420_snake_easter_egg.sql
\ir ../../supabase/migrations/2026-10-20_421_snake_bonus_score.sql
do $$
declare n int;
begin
  perform public.snake_log('finish', 'visitorBONUS1', 640, 'pl');
  perform public.snake_log('finish', 'visitorBONUS1', 99999, 'pl');
  select max(score) into n from public.snake_events where visitor = 'visitorBONUS1';
  if n <> 2000 then raise exception 'limit: %', n; end if;
  if not exists (select 1 from public.snake_events where visitor = 'visitorBONUS1' and score = 640) then raise exception 'wynik 640 przycięty'; end if;
end $$;
select 'snake-bonus-421: OK' as wynik;
rollback;
