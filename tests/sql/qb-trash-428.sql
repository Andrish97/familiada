-- Migracja 428: kosz menedżera bazy (qb_trash) jako rola authenticated.
-- Lokalna baza wg docs/sql/local-db.md (z 427): psql ... -f tests/sql/qb-trash-428.sql
\set ON_ERROR_STOP 1
begin;
-- uprawnienia tabel jak w Supabase, ale PRZED 428: qb_trash ma tylko te
-- nadane w migracji (wcześniej zbiorczy GRANT ukrył brak UPDATE)
grant select, insert, update, delete on all tables in schema public to authenticated;
\ir ../../supabase/migrations/2026-10-20_427_qb_atomic_ops.sql
\ir ../../supabase/migrations/2026-10-20_428_qb_trash.sql
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000428a1','owner428@example.test'),
 ('00000000-0000-4000-8000-0000000428c3','viewer428@example.test');
insert into public.profiles(id,username,email) values
 ('00000000-0000-4000-8000-0000000428a1','owner428','owner428@example.test'),
 ('00000000-0000-4000-8000-0000000428c3','viewer428','viewer428@example.test')
 on conflict (id) do nothing;
insert into public.question_bases(id,owner_id,name) values
 ('00000000-0000-4000-8000-000000042800','00000000-0000-4000-8000-0000000428a1','B428');
insert into public.question_base_shares(base_id,user_id,role) values
 ('00000000-0000-4000-8000-000000042800','00000000-0000-4000-8000-0000000428c3','viewer');

create temp table ids(k text primary key, v uuid);
grant all on ids to authenticated;
-- jak w Supabase: authenticated woła auth.uid()
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000428a1',true);

-- A/{A1/{q3}, q1}, q2 w korzeniu, tag t na q1 i q3
do $$
declare b uuid := '00000000-0000-4000-8000-000000042800'; a uuid; a1 uuid; q1 uuid; q2 uuid; q3 uuid; t uuid;
begin
  a := public.qb_create_folder(b, null, 'A');
  a1 := public.qb_create_folder(b, a, 'A1');
  q1 := public.qb_create_question(b, a, '{"text":"Pierwsze","answers":[{"text":"ODP","fixed_points":5}]}');
  q2 := public.qb_create_question(b, null, '{"text":"Drugie","answers":[]}');
  q3 := public.qb_create_question(b, a1, '{"text":"Trzecie","answers":[]}');
  t := (public.qb_save_tag(b, null, 'tag', null)->>'id')::uuid;
  perform public.qb_set_tag_links(b, array[t], array[q1, q3], null, true);
  insert into ids values ('a',a),('a1',a1),('q1',q1),('q2',q2),('q3',q3),('t',t);
end $$;

-- usunięcie A (+ zaznaczone wewnątrz q1, A1) i q2: dwa wpisy (folder A, pytanie q2)
do $$
declare b uuid := '00000000-0000-4000-8000-000000042800'; r jsonb; l jsonb;
begin
  r := public.qb_delete_items(b,
    array[(select v from ids where k='q1'), (select v from ids where k='q2')],
    array[(select v from ids where k='a'), (select v from ids where k='a1')]);
  if (r->>'questions')::int <> 3 or (r->>'folders')::int <> 2 or jsonb_array_length(r->'trash') <> 2 then raise exception 'delete: %', r; end if;
  if exists (select 1 from public.qb_questions where base_id = b) then raise exception 'pytania zostały'; end if;
  l := public.qb_trash_list(b);
  if jsonb_array_length(l) <> 2 then raise exception 'lista: %', l; end if;
  if not exists (select 1 from jsonb_array_elements(l) x where x->>'kind'='folder' and x->>'label'='A' and (x->>'n_questions')::int=2 and (x->>'n_folders')::int=2) then raise exception 'wpis folderu: %', l; end if;
  if not exists (select 1 from jsonb_array_elements(l) x where x->>'kind'='question' and x->>'label'='Drugie') then raise exception 'wpis pytania: %', l; end if;
  if not exists (select 1 from jsonb_array_elements(l) x where (x->>'expires_at')::timestamptz = (x->>'deleted_at')::timestamptz + interval '30 days') then raise exception 'expires_at'; end if;
  insert into ids select 'trash_'||(x->>'kind'), (x->>'id')::uuid from jsonb_array_elements(l) x;
end $$;

-- widz nie widzi kosza i nie przywraca
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000428c3',true);
do $$
begin
  perform public.qb_trash_list('00000000-0000-4000-8000-000000042800');
  raise exception 'widz zobaczył kosz';
exception when others then if sqlerrm <> 'qb:forbidden' then raise; end if;
end $$;
do $$ begin
  if exists (select 1 from public.qb_trash) then raise exception 'RLS: widz widzi wiersze kosza'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000428a1',true);

-- przywrócenie folderu: te same id, struktura, odpowiedzi i tagi; tag usunięty w międzyczasie pomijany
do $$
declare b uuid := '00000000-0000-4000-8000-000000042800'; r jsonb;
begin
  r := public.qb_trash_restore(b, array[(select v from ids where k='trash_folder')]);
  if (r->'folders'->>0)::uuid <> (select v from ids where k='a') then raise exception 'restore zwrot: %', r; end if;
  if (select parent_id from public.qb_categories where id=(select v from ids where k='a1')) <> (select v from ids where k='a') then raise exception 'A1 nie w A'; end if;
  if (select category_id from public.qb_questions where id=(select v from ids where k='q3')) <> (select v from ids where k='a1') then raise exception 'q3 nie w A1'; end if;
  if jsonb_array_length((select payload->'answers' from public.qb_questions where id=(select v from ids where k='q1'))) <> 1 then raise exception 'odpowiedzi q1'; end if;
  if (select count(*) from public.qb_question_tags where tag_id=(select v from ids where k='t')) <> 2 then raise exception 'tagi po przywróceniu'; end if;
  if exists (select 1 from public.qb_trash where id=(select v from ids where k='trash_folder')) then raise exception 'wpis został w koszu'; end if;
  -- drugi raz: wpisu już nie ma
  begin
    perform public.qb_trash_restore(b, array[(select v from ids where k='trash_folder')]);
    raise exception 'podwójne przywrócenie';
  exception when others then if sqlerrm <> 'qb:gone' then raise; end if; end;
end $$;

-- pytanie z folderu, którego już nie ma, wraca do korzenia
do $$
declare b uuid := '00000000-0000-4000-8000-000000042800'; r jsonb; tq uuid;
begin
  r := public.qb_delete_items(b, array[(select v from ids where k='q3')], null);
  tq := (r->'trash'->>0)::uuid;
  perform public.qb_delete_items(b, null, array[(select v from ids where k='a1')]);
  perform public.qb_trash_restore(b, array[tq]);
  if (select category_id from public.qb_questions where id=(select v from ids where k='q3')) is not null then raise exception 'q3 nie w korzeniu'; end if;
end $$;

-- usuń trwale jeden wpis, opróżnij kosz, czyszczenie po 30 dniach
do $$
declare b uuid := '00000000-0000-4000-8000-000000042800'; n int;
begin
  n := public.qb_trash_purge(b, array[(select v from ids where k='trash_question')]);
  if n <> 1 then raise exception 'purge jednego: %', n; end if;
  perform public.qb_delete_items(b, array[(select v from ids where k='q1')], null);
  n := public.qb_trash_purge(b, null);
  if n <> 2 then raise exception 'opróżnienie: %', n; end if; -- A1 i q1
  perform public.qb_delete_items(b, array[(select v from ids where k='q3')], null);
end $$;
reset role;
do $$
declare n int;
begin
  update public.qb_trash set deleted_at = now() - interval '31 days' where base_id = '00000000-0000-4000-8000-000000042800';
  insert into public.qb_trash(base_id,kind,item_id,snapshot) values ('00000000-0000-4000-8000-000000042800','question',gen_random_uuid(),'{}');
  n := public.qb_trash_cleanup();
  if n < 1 then raise exception 'cleanup: %', n; end if;
  if (select count(*) from public.qb_trash where base_id = '00000000-0000-4000-8000-000000042800') <> 1 then raise exception 'świeży wpis usunięty'; end if;
end $$;
select 'qb-trash-428 OK';
rollback;
