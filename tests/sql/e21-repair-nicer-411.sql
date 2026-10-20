-- Migracja 411 (E21): ładniejsza naprawa -- pytania cięte na granicy słowa
-- (z zachowaniem „?”), stare długie odpowiedzi baz demo -> wersje z 298.
-- Lokalna baza wg docs/sql/local-db.md; z katalogu repo:
-- psql ... -d fam -f tests/sql/e21-repair-nicer-411.sql
\set ON_ERROR_STOP 1
\set owner '41100000-0000-4000-8000-0000000000aa'
begin;
\ir ../../supabase/migrations/2026-10-20_404_e21_rules_engine.sql
\ir ../../supabase/migrations/2026-10-20_405_e21_poll_tally.sql
\ir ../../supabase/migrations/2026-10-20_407_e21_data_repair.sql
\ir ../../supabase/migrations/2026-10-20_409_e21_demo_rules.sql
\ir ../../supabase/migrations/2026-10-20_411_e21_repair_nicer.sql
insert into auth.users(id,email) values (:'owner','o411@x.pl');
insert into public.games(id,owner_id,name,type,status) values ('41100000-0000-4000-8000-000000000001',:'owner','G','prepared','draft');
set local session_replication_role = replica;
insert into public.questions(id,game_id,ord,text) values
 ('41100000-0000-4000-8001-000000000001','41100000-0000-4000-8000-000000000001',1, 'Co najczęściej robisz w sobotę rano, kiedy nie musisz iść do pracy ani do szkoły i masz cały dzień dla siebie?'),
 ('41100000-0000-4000-8001-000000000002','41100000-0000-4000-8000-000000000001',2, repeat('x', 150));
set local session_replication_role = origin;
insert into public.question_bases(id, owner_id, name, is_demo) values
 ('41100000-0000-4000-8000-0000000000b1', :'owner', 'Demo', true),
 ('41100000-0000-4000-8000-0000000000b2', :'owner', 'Moja', false);
insert into public.qb_questions(base_id, ord, payload) values
 ('41100000-0000-4000-8000-0000000000b1', 1, '{"text":"Q","answers":[{"text":"Pisk hamulców (z zewnątrz)","fixed_points":10},{"text":"Inna bardzo długa odpowiedź"}]}'),
 ('41100000-0000-4000-8000-0000000000b2', 1, '{"text":"Q","answers":[{"text":"Pisk hamulców (z zewnątrz)"}]}');

do $$
declare r jsonb; t text;
begin
  r := public.e21_data_repair();
  select text into t from public.questions where id = '41100000-0000-4000-8001-000000000001';
  if char_length(t) > 100 or right(t, 1) <> '?' or t ~ '[[:space:],]\?$' then raise exception 'pytanie: [%]', t; end if;
  if t <> 'Co najczęściej robisz w sobotę rano, kiedy nie musisz iść do pracy ani do szkoły i masz cały dzień?' then raise exception 'granica słowa: [%]', t; end if;
  select text into t from public.questions where id = '41100000-0000-4000-8001-000000000002';
  if t <> repeat('x', 100) then raise exception 'bez spacji: twarde cięcie'; end if;
  select q.payload->'answers'->0->>'text' into t from public.qb_questions q where q.base_id = '41100000-0000-4000-8000-0000000000b1';
  if t <> 'Pisk hamulców' then raise exception 'demo mapa: [%]', t; end if;
  select q.payload->'answers'->1->>'text' into t from public.qb_questions q where q.base_id = '41100000-0000-4000-8000-0000000000b1';
  if char_length(t) > 17 then raise exception 'demo reszta: [%]', t; end if;
  select q.payload->'answers'->0->>'text' into t from public.qb_questions q where q.base_id = '41100000-0000-4000-8000-0000000000b2';
  if t <> 'Pisk hamulców (z' then raise exception 'nie-demo: [%]', t; end if;
  if (r->>'demo_base_questions_mapped')::int <> 1 then raise exception 'raport: %', r; end if;
  raise notice 'e21-repair-nicer-411 OK (%)', r->>'demo_base_questions_mapped';
end $$;
rollback;
