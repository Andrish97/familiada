-- Migracje 409 + 413 (E21): gry demo zgodne z regułami typów -- szablony od razu,
-- nieedytowane kopie w nocnej naprawie (e21_data_repair), z ochroną Control.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql sprzed 404);
-- z katalogu repo: psql ... -d fam -f tests/sql/e21-demo-rules-409.sql
\set ON_ERROR_STOP 1
\set ua '40900000-0000-4000-8000-0000000000a1'
\set ub '40900000-0000-4000-8000-0000000000b1'
\set uc '40900000-0000-4000-8000-0000000000c1'
begin;
\ir ../../supabase/migrations/2026-10-20_404_e21_rules_engine.sql
\ir ../../supabase/migrations/2026-10-20_405_e21_poll_tally.sql
\ir ../../supabase/migrations/2026-10-20_407_e21_data_repair.sql

-- Szablony o kształcie produkcyjnym (odczyt 408): preparowana 6 odpowiedzi
-- z ostatnią <4 pkt; punktowa otwarta 8 ankiet, pytanie 2 z głosami tylko na
-- 2 odpowiedzi; tekstowa otwarta 6 ankiet.
delete from public.demo_template_data;
insert into public.demo_template_data(lang, slot, payload) values
('pl', 'prepared', jsonb_build_object('game', jsonb_build_object('name', 'Demo P', 'type', 'prepared'),
  'questions', (select jsonb_agg(jsonb_build_object('text', 'Pytanie ' || i, 'answers', jsonb_build_array(
     jsonb_build_object('text', 'A', 'fixed_points', case when i % 2 = 0 then 38 else 37 end), jsonb_build_object('text', 'B', 'fixed_points', 24),
     jsonb_build_object('text', 'C', 'fixed_points', 18), jsonb_build_object('text', 'D', 'fixed_points', 11),
     jsonb_build_object('text', 'E', 'fixed_points', 6), jsonb_build_object('text', 'F', 'fixed_points', case when i % 2 = 0 then 3 else 4 end)))) from generate_series(1, 10) i))),
('pl', 'poll_points_open', jsonb_build_object('game', jsonb_build_object('name', 'Demo PP', 'type', 'poll_points'),
  'questions', (select jsonb_agg(jsonb_build_object('text', 'Pytanie ' || i, 'answers', jsonb_build_array(
     jsonb_build_object('text', 'A'), jsonb_build_object('text', 'B'), jsonb_build_object('text', 'C'), jsonb_build_object('text', 'D')))) from generate_series(1, 10) i),
  'votes', (select jsonb_agg(jsonb_build_object('picks', (select jsonb_agg(case when q = 2 then (v % 2) else (v % 4) end) from generate_series(1, 10) q))) from generate_series(1, 8) v))),
('pl', 'poll_text_open', jsonb_build_object('game', jsonb_build_object('name', 'Demo PT', 'type', 'poll_text'),
  'questions', (select jsonb_agg(jsonb_build_object('text', 'Pytanie ' || i)) from generate_series(1, 10) i),
  'votes', (select jsonb_agg(jsonb_build_object('answers_raw', (select jsonb_agg('odp ' || (v % 3) || left(q::text, 0)) from generate_series(1, 10) q))) from generate_series(1, 6) v)));

insert into auth.users(id, email) values (:'ua', 'a409@x.pl'), (:'ub', 'b409@x.pl'), (:'uc', 'c409@x.pl');
select public.seed_demo_for_user(:'ua', 'pl'), public.seed_demo_for_user(:'ub', 'pl'), public.seed_demo_for_user(:'uc', 'pl');

-- B: edytowana preparowana i prawdziwy głos w punktowej; C: aktywny Control w preparowanej
update public.answers a set text = 'Zmienione' from public.questions q, public.games g
 where q.id = a.question_id and g.id = q.game_id and g.owner_id = :'ub' and g.type = 'prepared' and q.ord = 1 and a.ord = 1;
insert into public.poll_votes(game_id, question_ord, answer_ord, voter_token, poll_session_id, question_id, answer_id)
select g.id, 1, 1, 'real_voter_0001', ps.id, q.id, a.id from public.games g join public.questions q on q.game_id = g.id and q.ord = 1
  join public.poll_sessions ps on ps.question_id = q.id join public.answers a on a.question_id = q.id and a.ord = 1
 where g.owner_id = :'ub' and g.type = 'poll_points';
insert into public.control_runtime_sessions(game_id, owner_id)
select id, owner_id from public.games where owner_id = :'uc' and type = 'prepared';

\ir ../../supabase/migrations/2026-10-20_409_e21_demo_rules.sql
\ir ../../supabase/migrations/2026-10-20_413_e21_demo_match_content.sql
-- A: preparowana ze zmienioną samą nazwą -- nadal nieedytowana (413)
update public.games set name = 'Moja nazwa' where owner_id = '40900000-0000-4000-8000-0000000000a1' and type = 'prepared';

do $$
declare
  r jsonb;
  ua uuid := '40900000-0000-4000-8000-0000000000a1';
  ub uuid := '40900000-0000-4000-8000-0000000000b1';
  uc uuid := '40900000-0000-4000-8000-0000000000c1';
  t jsonb;
  g uuid;
begin
  -- szablony
  select payload into t from public.demo_template_data where lang = 'pl' and slot = 'prepared';
  if (select count(*) from jsonb_array_elements(t->'questions') q, jsonb_array_elements(q->'answers') a where (a->>'fixed_points')::int < 4) <> 0
    then raise exception 'szablon prepared: zostały odpowiedzi <4'; end if;
  if jsonb_array_length(t->'questions'->1->'answers') <> 5 or jsonb_array_length(t->'questions'->0->'answers') <> 6
    then raise exception 'szablon prepared: zła liczba odpowiedzi'; end if;
  select payload into t from public.demo_template_data where lang = 'pl' and slot = 'poll_points_open';
  if jsonb_array_length(t->'votes') <> 10 then raise exception 'szablon pp: % ankiet', jsonb_array_length(t->'votes'); end if;
  if (select count(distinct (v->'picks'->>1)) from jsonb_array_elements(t->'votes') v) < 3 then raise exception 'szablon pp: pytanie 2 < 3 odpowiedzi z głosami'; end if;
  select payload into t from public.demo_template_data where lang = 'pl' and slot = 'poll_text_open';
  if jsonb_array_length(t->'votes') <> 10 then raise exception 'szablon pt: % ankiet', jsonb_array_length(t->'votes'); end if;
  if t->'votes'->6 <> t->'votes'->0 then raise exception 'szablon pt: dopisana ankieta nie powtarza istniejącej'; end if;

  r := public.e21_data_repair();
  if (r->>'demo_prepared_games')::int <> 1 then raise exception 'kopie prepared: %', r; end if;
  if (r->>'demo_prepared_answers_removed')::int <> 5 then raise exception 'usunięte odpowiedzi: %', r; end if;
  if (r->>'demo_points_polls_filled')::int <> 2 then raise exception 'kopie pp: %', r; end if;
  if (r->>'demo_text_polls_filled')::int <> 3 then raise exception 'kopie pt: %', r; end if;
  if (r->>'demo_skipped_active_control')::int <> 1 then raise exception 'Control: %', r; end if;

  -- A: preparowana grywalna, ankiety podliczalne
  select id into g from public.games where owner_id = ua and type = 'prepared';
  if not (public.game_rules_compute(g, 'prepared', 'draft')->'play'->>'ok')::boolean then raise exception 'A prepared niegrywalna: %', public.game_rules_compute(g, 'prepared', 'draft'); end if;
  select id into g from public.games where owner_id = ua and type = 'poll_points' and status = 'poll_open';
  if public._poll_full_submissions(g) <> 10 then raise exception 'A pp: % pełnych', public._poll_full_submissions(g); end if;
  if not (public.game_poll_close_check(g)->>'ok')::boolean then raise exception 'A pp: podliczanie zablokowane'; end if;
  if (select count(distinct answer_id) from public.poll_votes v join public.questions q on q.id = v.question_id where v.game_id = g and q.ord = 2) < 3
    then raise exception 'A pp: pytanie 2 < 3 odpowiedzi'; end if;
  select id into g from public.games where owner_id = ua and type = 'poll_text' and status = 'poll_open';
  if public._poll_full_submissions(g) <> 10 then raise exception 'A pt: % pełnych', public._poll_full_submissions(g); end if;

  -- B: edytowana preparowana i ankieta z prawdziwym głosem bez zmian
  select id into g from public.games where owner_id = ub and type = 'prepared';
  if (select count(*) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = g) <> 60 then raise exception 'B prepared zmieniona'; end if;
  select id into g from public.games where owner_id = ub and type = 'poll_points' and status = 'poll_open';
  if exists (select 1 from public.poll_votes where game_id = g and voter_token in ('demo_seed_v0009', 'demo_seed_v0010')) then raise exception 'B pp zmieniona'; end if;
  -- C: aktywny Control bez zmian
  select id into g from public.games where owner_id = uc and type = 'prepared';
  if (select count(*) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = g) <> 60 then raise exception 'C zmieniona mimo Control'; end if;

  -- idempotencja: druga noc nic nie zmienia u A
  r := public.e21_data_repair();
  if (r->>'demo_prepared_games')::int <> 0 or (r->>'demo_points_polls_filled')::int <> 0 or (r->>'demo_text_polls_filled')::int <> 0 then raise exception 'druga noc: %', r; end if;
  raise notice 'e21-demo-rules OK';
end $$;
rollback;
