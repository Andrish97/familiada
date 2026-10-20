-- Migracja 407 (E21): naprawa danych -- pytania ≤100 (także ankiety), znaki
-- odpowiedzi, bazy pytań, ochrona aktywnego Control, idempotencja.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + 404–406);
-- z katalogu repo: psql ... -d fam -f tests/sql/e21-data-repair-407.sql
\set ON_ERROR_STOP 1
\set owner '40700000-0000-4000-8000-0000000000aa'
begin;
\ir ../../supabase/migrations/2026-10-20_404_e21_rules_engine.sql
\ir ../../supabase/migrations/2026-10-20_407_e21_data_repair.sql
insert into auth.users(id,email) values (:'owner','o407@x.pl');
insert into public.games(id,owner_id,name,type,status) values
 ('40700000-0000-4000-8000-000000000001',:'owner','P','prepared','draft'),
 ('40700000-0000-4000-8000-000000000002',:'owner','A','poll_points','draft'),
 ('40700000-0000-4000-8000-000000000003',:'owner','C','prepared','draft');
set local session_replication_role = replica;
update public.games set status = 'ready' where id = '40700000-0000-4000-8000-000000000002';
insert into public.questions(id,game_id,ord,text) values
 ('40700000-0000-4000-8001-000000000001','40700000-0000-4000-8000-000000000001',1,repeat('x',100)),
 ('40700000-0000-4000-8001-000000000002','40700000-0000-4000-8000-000000000001',2,repeat('y',150)),
 ('40700000-0000-4000-8001-000000000003','40700000-0000-4000-8000-000000000002',1,repeat('z',101)),
 ('40700000-0000-4000-8001-000000000004','40700000-0000-4000-8000-000000000003',1,repeat('w',120));
insert into public.answers(id,question_id,ord,text,fixed_points) values
 ('40700000-0000-4000-8002-000000000001','40700000-0000-4000-8001-000000000001',1,'kawa😀',40),
 ('40700000-0000-4000-8002-000000000002','40700000-0000-4000-8001-000000000001',2,'😀😀',30),
 ('40700000-0000-4000-8002-000000000003','40700000-0000-4000-8001-000000000003',1,'ąę👍',25);
set local session_replication_role = origin;
-- aktywny Control w grze C
insert into public.control_runtime_sessions(game_id, owner_id) values ('40700000-0000-4000-8000-000000000003', :'owner');
insert into public.question_bases(id, owner_id, name) values ('40700000-0000-4000-8000-0000000000b1', :'owner', 'B');
insert into public.qb_questions(base_id, ord, payload) values ('40700000-0000-4000-8000-0000000000b1', 1,
  jsonb_build_object('text', repeat('q', 129), 'answers', jsonb_build_array(jsonb_build_object('text', 'bardzo długa odpowiedź ponad', 'fixed_points', 10), jsonb_build_object('text', 'ok'))));

do $$
declare r jsonb; r2 jsonb;
begin
  r := public.e21_data_repair();
  if (r->>'questions_truncated')::int <> 2 then raise exception 'pytania: %', r; end if;
  if (select char_length(text) from public.questions where id = '40700000-0000-4000-8001-000000000001') <> 100 then raise exception '100 bez zmian'; end if;
  if (select char_length(text) from public.questions where id = '40700000-0000-4000-8001-000000000003') <> 100 then raise exception 'ankieta zamknięta: pytanie'; end if;
  if (select char_length(text) from public.questions where id = '40700000-0000-4000-8001-000000000004') <> 120 then raise exception 'aktywny Control zmieniony'; end if;
  if (select text || ':' || fixed_points from public.answers where id = '40700000-0000-4000-8002-000000000001') <> 'kawa:40' then raise exception 'czyszczenie odpowiedzi'; end if;
  if (select text || ':' || fixed_points from public.answers where id = '40700000-0000-4000-8002-000000000003') <> 'ąę:25' then raise exception 'odpowiedź ankiety'; end if;
  if (select text from public.answers where id = '40700000-0000-4000-8002-000000000002') <> '😀😀' then raise exception 'pusta po oczyszczeniu zmieniona'; end if;
  if r->'answers_empty_after_clean' <> '["40700000-0000-4000-8002-000000000002"]' then raise exception 'raport pustych: %', r; end if;
  if (select status::text from public.games where id = '40700000-0000-4000-8000-000000000002') <> 'ready' then raise exception 'status ankiety'; end if;
  if (select char_length(payload->>'text') || ':' || (payload#>>'{answers,0,text}') from public.qb_questions where base_id = '40700000-0000-4000-8000-0000000000b1')
     <> '100:bardzo długa odpo' then raise exception 'baza: %', (select payload from public.qb_questions where base_id = '40700000-0000-4000-8000-0000000000b1'); end if;
  if (r->>'questions_constraint')::boolean then raise exception 'ograniczenie przy aktywnym Control'; end if;
  -- Control wygasł: kolejna noc kończy naprawę i zakłada ograniczenie pytań
  update public.control_runtime_sessions set expires_at = now() - interval '1 second' where game_id = '40700000-0000-4000-8000-000000000003';
  r2 := public.e21_data_repair();
  if (r2->>'questions_truncated')::int <> 1 or not (r2->>'questions_constraint')::boolean or (r2->>'answers_constraint')::boolean then raise exception 'druga noc: %', r2; end if;
  -- idempotencja
  r2 := public.e21_data_repair();
  if (r2->>'questions_truncated')::int + (r2->>'answers_cleaned')::int + (r2->>'base_questions_truncated')::int + (r2->>'base_questions_answers_fixed')::int <> 0 then raise exception 'ponowne wykonanie zmienia dane: %', r2; end if;
  if (select count(*) from public.e21_repair_runs) < 3 then raise exception 'raport'; end if;
end $$;
select 'e21-data-repair-407: OK' as wynik;
rollback;
