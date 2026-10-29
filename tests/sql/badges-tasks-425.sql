-- Migracja 425: tasks_pending liczy tylko ankiety, nie zaproszenia do baz.
-- Lokalna baza wg docs/sql/local-db.md: psql ... -f tests/sql/badges-tasks-425.sql
\set ON_ERROR_STOP 1
begin;
\ir ../../supabase/migrations/2026-10-20_425_badges_tasks_polls_only.sql
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000005a1','owner425@example.test',now()),
 ('00000000-0000-4000-8000-0000000005b2','rcpt425@example.test',now());
insert into public.profiles(id,username,email) values
 ('00000000-0000-4000-8000-0000000005a1','owner425','owner425@example.test'),
 ('00000000-0000-4000-8000-0000000005b2','rcpt425','rcpt425@example.test')
 on conflict (id) do nothing;
insert into public.question_bases(id,name,owner_id) values ('00000000-0000-4000-8000-0000000005c1','Baza 425','00000000-0000-4000-8000-0000000005a1');
insert into public.base_share_tasks(owner_id,recipient_user_id,base_id,role,status)
 values ('00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-0000000005b2','00000000-0000-4000-8000-0000000005c1','viewer','pending');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000005b2',true);
do $$
declare r jsonb;
begin
  r := public.badges_get();
  if (r->>'tasks_pending')::int <> 0 then raise exception 'zaproszenie do bazy w licznikach zadań: %', r; end if;
end $$;
select 'badges-tasks-425: OK' as wynik;
rollback;
