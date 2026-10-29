-- Migracja 442: średnia ocen i lista admina bez kont testowych.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracja 442).
\set ON_ERROR_STOP 1
begin;
insert into auth.users(id,email) values ('44200000-0000-4000-8000-000000000001','test1@familiada.online'),('44200000-0000-4000-8000-000000000002','ktos@example.com');
insert into public.profiles(id,username,email) values ('44200000-0000-4000-8000-000000000001','t442','test1@familiada.online'),('44200000-0000-4000-8000-000000000002','k442','ktos@example.com')
  on conflict (id) do nothing;
delete from public.app_ratings;
insert into public.app_ratings(user_id,stars,comment) values ('44200000-0000-4000-8000-000000000001',5,'E2E'),('44200000-0000-4000-8000-000000000002',3,'ok');
do $$ declare s record; n int; begin
  select * into s from public.get_app_rating_stats();
  if s.total_count <> 1 or s.avg_stars <> 3.0 then raise exception 'stats: % %', s.total_count, s.avg_stars; end if;
  select count(*) into n from public.get_ratings_admin();
  if n <> 1 then raise exception 'admin: %', n; end if;
  raise notice 'ratings-exclude-442: OK';
end $$;
rollback;
