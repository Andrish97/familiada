-- Migracja 427: atomowe operacje menedżera bazy (qb_*), jako rola
-- authenticated (RLS + wyzwalacz treści pytań działają jak z przeglądarki).
-- Lokalna baza wg docs/sql/local-db.md: psql ... -f tests/sql/qb-atomic-ops-427.sql
\set ON_ERROR_STOP 1
begin;
\ir ../../supabase/migrations/2026-10-20_427_qb_atomic_ops.sql
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000427a1','owner427@example.test'),
 ('00000000-0000-4000-8000-0000000427b2','editor427@example.test'),
 ('00000000-0000-4000-8000-0000000427c3','viewer427@example.test'),
 ('00000000-0000-4000-8000-0000000427d4','stranger427@example.test');
insert into public.profiles(id,username,email) values
 ('00000000-0000-4000-8000-0000000427a1','owner427','owner427@example.test'),
 ('00000000-0000-4000-8000-0000000427b2','editor427','editor427@example.test'),
 ('00000000-0000-4000-8000-0000000427c3','viewer427','viewer427@example.test'),
 ('00000000-0000-4000-8000-0000000427d4','stranger427','stranger427@example.test')
 on conflict (id) do nothing;
insert into public.question_bases(id,owner_id,name) values
 ('00000000-0000-4000-8000-000000042700','00000000-0000-4000-8000-0000000427a1','B427'),
 ('00000000-0000-4000-8000-000000042701','00000000-0000-4000-8000-0000000427d4','Obca');
insert into public.question_base_shares(base_id,user_id,role) values
 ('00000000-0000-4000-8000-000000042700','00000000-0000-4000-8000-0000000427b2','editor'),
 ('00000000-0000-4000-8000-000000042700','00000000-0000-4000-8000-0000000427c3','viewer');

create temp table ids(k text primary key, v uuid);
grant all on ids to authenticated;
-- jak w Supabase: authenticated woła auth.uid()
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000427a1',true);

-- tworzenie: A/{A1/{q3}, q1, q2}, B, tag t1 na q1
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700'; a uuid; a1 uuid; bb uuid; q1 uuid; q2 uuid; q3 uuid; t1 jsonb;
begin
  a := public.qb_create_folder(b, null, '  A  ');
  bb := public.qb_create_folder(b, null, 'B');
  a1 := public.qb_create_folder(b, a, 'A1');
  q1 := public.qb_create_question(b, a, '{"text":"Pierwsze","answers":[{"text":"ODP","fixed_points":10}]}');
  q2 := public.qb_create_question(b, a, '{"text":"Drugie","answers":[]}');
  q3 := public.qb_create_question(b, a1, '{"text":"Trzecie","answers":[]}');
  t1 := public.qb_save_tag(b, null, '#fajne', '#ff0000');
  insert into ids values ('a',a),('a1',a1),('b',bb),('q1',q1),('q2',q2),('q3',q3),('t1',(t1->>'id')::uuid);
  if (select name from public.qb_categories where id=a) <> 'A' then raise exception 'nazwa nie przycięta'; end if;
  if (select ord from public.qb_categories where id=bb) <> 2 then raise exception 'ord folderu B'; end if;
  if (select ord from public.qb_questions where id=q2) <> 2 then raise exception 'ord pytania q2'; end if;
  if (select updated_by from public.qb_questions where id=q1) is distinct from auth.uid() then raise exception 'updated_by'; end if;
  if (select name from public.qb_tags where id=(t1->>'id')::uuid) <> 'fajne' then raise exception 'tag bez #'; end if;
  perform public.qb_set_tag_links(b, array[(t1->>'id')::uuid], array[q1], null, true);
end $$;

-- zmiana treści F2 nie rusza odpowiedzi; zwraca poprzednią
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700'; old text; p jsonb;
begin
  old := public.qb_set_question_text(b, (select v from ids where k='q1'), 'Nowa treść');
  if old <> 'Pierwsze' then raise exception 'poprzedni tekst: %', old; end if;
  select payload into p from public.qb_questions where id=(select v from ids where k='q1');
  if p->>'text' <> 'Nowa treść' or jsonb_array_length(p->'answers') <> 1 then raise exception 'payload po F2: %', p; end if;
  if public.qb_rename_folder(b, (select v from ids where k='b'), 'Be') <> 'B' then raise exception 'rename zwrot'; end if;
  p := public.qb_save_question(b, (select v from ids where k='q2'), '{"text":"Drugie2","answers":[]}');
  if p->>'text' <> 'Drugie' then raise exception 'save zwrot: %', p; end if;
end $$;

-- wyzwalacz treści działa (pytanie >100 znaków)
do $$
begin
  perform public.qb_set_question_text('00000000-0000-4000-8000-000000042700', (select v from ids where k='q1'), repeat('x',101));
  raise exception 'brak odmowy dla >100';
exception when others then
  if sqlerrm not like 'content_invalid:questionTooLong%' then raise; end if;
end $$;

-- przeniesienie do własnego poddrzewa = qb:cycle, nic się nie zmienia
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700';
begin
  begin
    perform public.qb_move_items(b, null, array[(select v from ids where k='a')], (select v from ids where k='a1'));
    raise exception 'brak odmowy cyklu';
  exception when others then
    if sqlerrm <> 'qb:cycle' then raise; end if;
  end;
  begin
    perform public.qb_reorder_folders(b, (select v from ids where k='a1'), array[(select v from ids where k='a')]);
    raise exception 'brak odmowy cyklu (reorder)';
  exception when others then
    if sqlerrm <> 'qb:cycle' then raise; end if;
  end;
end $$;

-- przeniesienie + przywrócenie pozycji (cofanie)
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700'; before jsonb;
begin
  before := public.qb_move_items(b, array[(select v from ids where k='q2')], array[(select v from ids where k='a1')], (select v from ids where k='b'));
  if (select category_id from public.qb_questions where id=(select v from ids where k='q2')) <> (select v from ids where k='b') then raise exception 'q2 nie przeniesione'; end if;
  if (select parent_id from public.qb_categories where id=(select v from ids where k='a1')) <> (select v from ids where k='b') then raise exception 'a1 nie przeniesione'; end if;
  perform public.qb_restore_positions(b, before);
  if (select category_id from public.qb_questions where id=(select v from ids where k='q2')) <> (select v from ids where k='a') then raise exception 'q2 nie wróciło'; end if;
  if (select parent_id from public.qb_categories where id=(select v from ids where k='a1')) <> (select v from ids where k='a') then raise exception 'a1 nie wróciło'; end if;
  -- reorder w korzeniu: B przed A
  before := public.qb_reorder_folders(b, null, array[(select v from ids where k='b'), (select v from ids where k='a')]);
  if (select ord from public.qb_categories where id=(select v from ids where k='b')) <> 1 then raise exception 'reorder'; end if;
  perform public.qb_restore_positions(b, before);
  if (select ord from public.qb_categories where id=(select v from ids where k='a')) <> 1 then raise exception 'reorder cofnięty'; end if;
end $$;

-- kopia folderu A (z A1, q1, q2, q3 i tagiem) do korzenia + kopia q1 do B;
-- kopia A do własnego A1 też działa (bez zapętlenia)
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700'; r jsonb; na uuid; nq uuid; n int;
begin
  r := public.qb_copy_items(b, array[(select v from ids where k='q1')], array[(select v from ids where k='a')], (select v from ids where k='b'));
  na := (r->'folders'->>0)::uuid; nq := (r->'questions'->>0)::uuid;
  if (select name from public.qb_categories where id=na) <> 'A' then raise exception 'nazwa kopii w B: %', (select name from public.qb_categories where id=na); end if;
  if (select count(*) from public._qb_folder_subtree(b, array[na])) <> 2 then raise exception 'poddrzewo kopii'; end if;
  select count(*) into n from public.qb_questions where category_id in (select id from public._qb_folder_subtree(b, array[na]));
  if n <> 3 then raise exception 'pytania w kopii: %', n; end if;
  if not exists (select 1 from public.qb_question_tags where question_id=nq and tag_id=(select v from ids where k='t1')) then raise exception 'tag kopii pytania'; end if;
  if (select count(*) from public.qb_question_tags l join public.qb_questions q on q.id=l.question_id where q.category_id=na) <> 1 then raise exception 'tag w kopii folderu'; end if;
  r := public.qb_copy_items(b, null, array[(select v from ids where k='a')], null);
  if (select name from public.qb_categories where id=(r->'folders'->>0)::uuid) <> 'A (kopia)' then raise exception 'nazwa (kopia)'; end if;
  r := public.qb_copy_items(b, null, array[(select v from ids where k='a')], (select v from ids where k='a1'));
  if (select count(*) from public._qb_folder_subtree(b, array[(r->'folders'->>0)::uuid])) <> 2 then raise exception 'kopia do własnego podfolderu'; end if;
end $$;

-- tagi: zdjęcie z folderu A (całe poddrzewo), okno tagów, usunięcie tagu + odtworzenie przypisań
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700'; t uuid := (select v from ids where k='t1'); r jsonb; d jsonb;
begin
  r := public.qb_apply_tag_states(b, null, array[(select v from ids where k='a')], array[t], null);
  -- A ma też kopię A' (w A1) z poprzedniego kroku: q2, q3, q2', q3' (q1 i q1' już miały)
  if jsonb_array_length(r->'added') <> 4 then raise exception 'okno tagów: dodane %', r; end if;
  r := public.qb_set_tag_links(b, array[t], null, array[(select v from ids where k='a')], false);
  if jsonb_array_length(r->'questionLinks') <> 6 then raise exception 'zdjęcie z poddrzewa: %', r; end if;
  perform public.qb_restore_tag_links(b, r->'questionLinks', null);
  if (select count(*) from public.qb_question_tags where tag_id=t and question_id in (select v from ids where k in ('q1','q2','q3'))) <> 3 then raise exception 'odtworzenie przypisań'; end if;
  begin
    perform public.qb_save_tag(b, null, 'FAJNE', null);
    raise exception 'brak odmowy duplikatu';
  exception when others then if sqlerrm <> 'qb:duplicate' then raise; end if; end;
  -- polskie litery dozwolone; „latwe” przy „Łatwe” to duplikat (porównanie jak wyszukiwarka)
  perform public.qb_save_tag(b, null, 'Łatwe_źródło', null);
  begin
    perform public.qb_save_tag(b, null, 'latwe_zrodlo', null);
    raise exception 'brak odmowy duplikatu bez polskich znaków';
  exception when others then if sqlerrm <> 'qb:duplicate' then raise; end if; end;
  begin
    perform public.qb_save_tag(b, null, 'ze spacją', null);
    raise exception 'brak odmowy spacji';
  exception when others then if sqlerrm <> 'qb:invalid' then raise; end if; end;
  d := public.qb_delete_tags(b, array[t]);
  if jsonb_array_length(d->'tags') <> 1 or jsonb_array_length(d->'questionLinks') < 3 then raise exception 'usunięcie tagu: %', d; end if;
  if exists (select 1 from public.qb_question_tags where tag_id=t) then raise exception 'przypisania zostały'; end if;
end $$;

-- usunięcie folderu A kasuje poddrzewo i pytania (bez sierot w korzeniu)
do $$
declare b uuid := '00000000-0000-4000-8000-000000042700'; r jsonb;
begin
  r := public.qb_delete_items(b, null, array[(select v from ids where k='a')]);
  -- A, A1 i kopia A w A1 (A', A1') = 4 foldery; q1–q3 i ich kopie w A' = 6 pytań
  if (r->>'folders')::int <> 4 or (r->>'questions')::int <> 6 then raise exception 'usunięcie: %', r; end if;
  if exists (select 1 from public.qb_questions where base_id=b and category_id is null) then raise exception 'sieroty w korzeniu'; end if;
end $$;

-- edytor może, widz i obcy nie (qb:forbidden); cudzy folder = qb:gone
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000427b2',true);
do $$ begin perform public.qb_create_folder('00000000-0000-4000-8000-000000042700', null, 'Od edytora'); end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000427c3',true);
do $$
begin
  perform public.qb_create_folder('00000000-0000-4000-8000-000000042700', null, 'Od widza');
  raise exception 'widz utworzył folder';
exception when others then if sqlerrm <> 'qb:forbidden' then raise; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000427d4',true);
do $$
begin
  -- obcy we własnej bazie nie może przenieść folderu z B427
  perform public.qb_move_items('00000000-0000-4000-8000-000000042701', null, array[(select v from ids where k='b')], null);
  raise exception 'obcy przeniósł cudzy folder';
exception when others then if sqlerrm <> 'qb:gone' then raise; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.qb_categories where base_id='00000000-0000-4000-8000-000000042700' and name='Od edytora') <> 1 then raise exception 'folder edytora'; end if;
end $$;
select 'qb-atomic-ops-427 OK';
rollback;
