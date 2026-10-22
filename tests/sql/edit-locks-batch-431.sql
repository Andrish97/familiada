-- Migracja 431: blokady zbiorcze (wszystko albo nic, ta sama semantyka co pojedyncze).
-- Lokalna baza wg docs/sql/local-db.md: psql ... -f tests/sql/edit-locks-batch-431.sql
\set ON_ERROR_STOP 1
begin;
grant select, insert, update, delete on all tables in schema public to authenticated;
\ir ../../supabase/migrations/2026-10-20_427_qb_atomic_ops.sql
\ir ../../supabase/migrations/2026-10-20_431_edit_locks_batch.sql
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000431a1','owner431@example.test');
insert into public.profiles(id,username,email) values ('00000000-0000-4000-8000-0000000431a1','owner431','owner431@example.test') on conflict (id) do nothing;
insert into public.question_bases(id,owner_id,name) values ('00000000-0000-4000-8000-000000043100','00000000-0000-4000-8000-0000000431a1','B431');
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000431a1',true);
do $$
declare b uuid := '00000000-0000-4000-8000-000000043100'; q1 uuid; q2 uuid; q3 uuid; r jsonb;
begin
  q1 := public.qb_create_question(b, null, '{"text":"1","answers":[]}');
  q2 := public.qb_create_question(b, null, '{"text":"2","answers":[]}');
  q3 := public.qb_create_question(b, null, '{"text":"3","answers":[]}');

  r := public.acquire_edit_locks(jsonb_build_array(
         jsonb_build_object('type','base_question','id',q1), jsonb_build_object('type','base_question','id',q2)), 'tabA', 'test');
  if r->>'ok' <> 'true' or (r->>'count')::int <> 2 then raise exception 'A: %', r; end if;
  -- odnowienie tym samym wywołaniem
  r := public.acquire_edit_locks(jsonb_build_array(
         jsonb_build_object('type','base_question','id',q1), jsonb_build_object('type','base_question','id',q2)), 'tabA', 'test');
  if r->>'ok' <> 'true' then raise exception 'odnowienie: %', r; end if;

  -- druga karta: q3 wolne, q2 zajęte -> odmowa, q3 NIE zostaje zajęte
  r := public.acquire_edit_locks(jsonb_build_array(
         jsonb_build_object('type','base_question','id',q3), jsonb_build_object('type','base_question','id',q2)), 'tabB', 'test');
  if r->>'ok' <> 'false' or r->>'error' <> 'locked' or (r->'resource'->>'id')::uuid <> q2 then raise exception 'B: %', r; end if;
  if exists (select 1 from public.edit_locks where holder_tab_id = 'tabB') then raise exception 'B trzyma część blokad'; end if;

  -- nieistniejący zasób: gone
  r := public.acquire_edit_locks(jsonb_build_array(jsonb_build_object('type','base_question','id',gen_random_uuid())), 'tabC');
  if r->>'error' <> 'gone' then raise exception 'gone: %', r; end if;

  -- zwolnienie A -> B może zająć
  perform public.release_edit_locks(jsonb_build_array(
         jsonb_build_object('type','base_question','id',q1), jsonb_build_object('type','base_question','id',q2)), 'tabA');
  r := public.acquire_edit_locks(jsonb_build_array(
         jsonb_build_object('type','base_question','id',q3), jsonb_build_object('type','base_question','id',q2)), 'tabB', 'test');
  if r->>'ok' <> 'true' then raise exception 'po zwolnieniu: %', r; end if;
end $$;
select 'edit-locks-batch-431 OK';
rollback;
