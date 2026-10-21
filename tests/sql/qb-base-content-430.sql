-- Migracja 430: cała zawartość bazy jednym zapytaniem (RLS jak przy odczytach).
-- Lokalna baza wg docs/sql/local-db.md: psql ... -f tests/sql/qb-base-content-430.sql
\set ON_ERROR_STOP 1
begin;
grant select, insert, update, delete on all tables in schema public to authenticated;
\ir ../../supabase/migrations/2026-10-20_427_qb_atomic_ops.sql
\ir ../../supabase/migrations/2026-10-20_430_qb_base_content.sql
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-0000000430a1','owner430@example.test'),
  ('00000000-0000-4000-8000-0000000430b2','obcy430@example.test');
insert into public.profiles(id,username,email) values
  ('00000000-0000-4000-8000-0000000430a1','owner430','owner430@example.test'),
  ('00000000-0000-4000-8000-0000000430b2','obcy430','obcy430@example.test') on conflict (id) do nothing;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000430c3','czyt430@example.test');
insert into public.profiles(id,username,email) values ('00000000-0000-4000-8000-0000000430c3','czyt430','czyt430@example.test') on conflict (id) do nothing;
insert into public.question_bases(id,owner_id,name) values ('00000000-0000-4000-8000-000000043000','00000000-0000-4000-8000-0000000430a1','B430');
insert into public.question_base_shares(base_id,user_id,role) values ('00000000-0000-4000-8000-000000043000','00000000-0000-4000-8000-0000000430c3','viewer');
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000430a1',true);
do $$
declare b uuid := '00000000-0000-4000-8000-000000043000'; f uuid; q1 uuid; q2 uuid; t uuid; c jsonb;
begin
  f := public.qb_create_folder(b, null, 'Folder');
  q1 := public.qb_create_question(b, f, '{"text":"Jeden","answers":[{"text":"A","fixed_points":5}]}');
  q2 := public.qb_create_question(b, null, '{"text":"Dwa","answers":[]}');
  t := (public.qb_save_tag(b, null, 'tag', '#123456')->>'id')::uuid;
  perform public.qb_set_tag_links(b, array[t], array[q1], null, true);

  c := public.qb_base_content(b);
  if jsonb_array_length(c->'categories') <> 1 then raise exception 'foldery: %', c->'categories'; end if;
  if jsonb_array_length(c->'questions') <> 2 then raise exception 'pytania'; end if;
  if jsonb_array_length(c->'tags') <> 1 then raise exception 'tagi'; end if;
  if c->'questionTags' <> jsonb_build_array(jsonb_build_object('question_id', q1, 'tag_id', t)) then raise exception 'przypisania: %', c->'questionTags'; end if;
  if (select (x->>'category_id')::uuid from jsonb_array_elements(c->'questions') x where (x->>'id')::uuid = q1) is distinct from f then raise exception 'folder pytania'; end if;
  if public.qb_question_tag_links(b, array[q1, q2]) <> jsonb_build_array(jsonb_build_object('question_id', q1, 'tag_id', t)) then raise exception 'qb_question_tag_links'; end if;
  if (select x->'payload'->'answers'->0->>'fixed_points' from jsonb_array_elements(c->'questions') x where (x->>'id')::uuid = q1) <> '5' then raise exception 'payload'; end if;
end $$;

-- obcy: RLS — puste listy, bez błędu
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000430b2',true);
do $$
declare c jsonb := public.qb_base_content('00000000-0000-4000-8000-000000043000');
begin
  if c <> '{"tags":[],"questions":[],"categories":[],"questionTags":[]}'::jsonb then raise exception 'obcy widzi dane: %', c; end if;
  if public.qb_question_tag_links('00000000-0000-4000-8000-000000043000', (select array_agg(id) from public.qb_questions)) <> '[]'::jsonb then raise exception 'obcy widzi przypisania'; end if;
end $$;
-- czytelnik (udostępnienie): widzi wszystko
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000430c3',true);
do $$
declare c jsonb := public.qb_base_content('00000000-0000-4000-8000-000000043000');
begin
  if jsonb_array_length(c->'questions') <> 2 or jsonb_array_length(c->'questionTags') <> 1 then raise exception 'czytelnik: %', c; end if;
  if jsonb_array_length(public.qb_question_tag_links('00000000-0000-4000-8000-000000043000',
       (select array_agg((x->>'id')::uuid) from jsonb_array_elements(c->'questions') x))) <> 1 then raise exception 'czytelnik: przypisania'; end if;
end $$;
select 'qb-base-content-430 OK';
rollback;
