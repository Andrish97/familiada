-- Migracja 405 (E21): podliczanie -- pełne ankiety, udziały, 4%, szóstka z remisem.
-- Uruchomienie: lokalna baza wg docs/sql/local-db.md (schema.sql + 404), potem
-- z katalogu repo: psql ... -d fam -f tests/sql/e21-poll-tally-405.sql
\set ON_ERROR_STOP 1
\set owner '40500000-0000-4000-8000-0000000000aa'
\set g '40500000-0000-4000-8000-000000000001'
begin;
\ir ../../supabase/migrations/2026-10-20_405_e21_poll_tally.sql
insert into auth.users(id,email) values (:'owner','o405@x.pl');
insert into public.games(id,owner_id,name,type,status) values (:'g',:'owner','T405','poll_text','draft');
insert into public.questions(id,game_id,ord,text)
select ('40500000-0000-4000-8001-0000000000' || lpad(i::text,2,'0'))::uuid, :'g', i, 'Pytanie ' || i from generate_series(1,10) i;
insert into public.poll_sessions(id, game_id, question_id, question_ord, is_open)
select gen_random_uuid(), :'g', q.id, q.ord, true from public.questions q where q.game_id = :'g';
set local session_replication_role = replica;
update public.games set status = 'poll_stopped' where id = :'g';
set local session_replication_role = origin;
-- 9 pełnych ankiet + jedna częściowa (5 pytań)
insert into public.poll_text_entries(game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
select :'g', s.id, s.question_id, 'voter-' || lpad(v::text, 4, '0'), 'kawa😀', 'kawa😀'
from public.poll_sessions s, generate_series(1,9) v where s.game_id = :'g';
insert into public.poll_text_entries(game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
select :'g', s.id, s.question_id, 'voter-part', 'herbata', 'herbata'
from public.poll_sessions s where s.game_id = :'g' and s.question_ord <= 5;
select set_config('request.jwt.claim.sub',:'owner',true);

do $$
declare r jsonb; g uuid := '40500000-0000-4000-8000-000000000001';
begin
  -- zaokrąglanie: 0 -> 0, dodatni <1% -> 1, poza tym floor
  if public._poll_share(0, 30) <> 0 or public._poll_share(8, 1000) <> 1 or public._poll_share(39, 1000) <> 3
     or public._poll_share(4, 100) <> 4 or public._poll_share(10, 30) <> 33 or public._poll_share(19, 1000) <> 1 then
    raise exception '_poll_share';
  end if;
  r := public.game_poll_close_check(g);
  if r->>'code' <> 'tallyMinVotes' or (r->'params'->>'n')::int <> 9 then raise exception '9 pełnych + częściowa: %', r; end if;
end $$;

-- 10. pełna ankieta: częściowy głosujący uzupełnia resztę pytań
insert into public.poll_text_entries(game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
select :'g', s.id, s.question_id, 'voter-part', 'kawa', 'kawa'
from public.poll_sessions s where s.game_id = :'g' and s.question_ord > 5;

do $$
declare r jsonb; g uuid := '40500000-0000-4000-8000-000000000001'; src jsonb;
begin
  r := public.game_poll_close_check(g);
  if not (r->>'ok')::boolean or (r->'params'->>'n')::int <> 10 then raise exception '10 pełnych: %', r; end if;
  -- oczyszczenie przed grupowaniem: „kawa😀” i „kawa” to jedna odpowiedź
  src := public.poll_tally_source(g);
  if (src->>'n')::int <> 10 then raise exception 'source n'; end if;
  if src->'questions'->9->'items' <> '[{"text": "kawa", "count": 10}]'::jsonb then raise exception 'grupowanie: %', src->'questions'->9; end if;
  -- za mało kwalifikujących odpowiedzi -> zatwierdzenie odrzucone
  begin
    perform public.poll_text_tally_apply(g, jsonb_build_object('items', (
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'answers', '[{"text":"kawa","count":10}]'::jsonb)) from public.questions q where q.game_id = g)));
    raise exception 'zatwierdzono z 1 odpowiedzią';
  exception when others then
    if sqlerrm not like 'poll_close_blocked:closeMinText:%' then raise; end if;
  end;
  -- liczby z klienta ponad pełne ankiety -> nieaktualny podgląd
  begin
    perform public.poll_text_tally_apply(g, jsonb_build_object('items', (
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'answers', '[{"text":"a","count":6},{"text":"b","count":5},{"text":"c","count":4}]'::jsonb)) from public.questions q where q.game_id = g)));
    raise exception 'przyjęto 15 głosów przy 10 ankietach';
  exception when others then
    if sqlerrm not like 'poll_close_blocked:tallyStale:%' then raise; end if;
  end;
end $$;

-- Szóstka: N=20, A5 B4 C3 D2 E2 F1 G1 H… -> 25/20/15/10/10/5/5; remis F/G na granicy
do $$
declare a jsonb := '[{"text":"A","count":5},{"text":"B","count":4},{"text":"C","count":3},{"text":"D","count":2},{"text":"E","count":2},{"text":"F 😀","count":1},{"text":"G","count":1},{"text":"😀","count":2}]';
  s text;
begin
  select string_agg(atext || ':' || points, ',' order by ord) into s from public._poll_text_tally_select(a, null, 20);
  if s <> 'A:25,B:20,C:15,D:10,E:10,F:5' then raise exception 'domyślna szóstka: %', s; end if;
  select string_agg(atext, ',' order by ord) into s from public._poll_text_tally_select(a, '["A","B","C","D","E","g"]', 20);
  if s <> 'A,B,C,D,E,G' then raise exception 'wybór z remisu: %', s; end if;
  begin
    perform * from public._poll_text_tally_select(a, '["A","B","C","D","F","G"]', 20);
    raise exception 'pominięto lepszą odpowiedź spoza remisu';
  exception when raise_exception then if sqlerrm <> 'tally_selection' then raise; end if; end;
  -- 3,9% nie kwalifikuje się; równe procenty z różnych liczebności nie dają remisu
  select string_agg(atext || ':' || points, ',' order by ord) into s from public._poll_text_tally_select(
    '[{"text":"A","count":100},{"text":"B","count":40},{"text":"C","count":30},{"text":"D","count":11},{"text":"E","count":10},{"text":"F","count":9},{"text":"G","count":8},{"text":"H","count":7}]', null, 200);
  if s <> 'A:50,B:20,C:15,D:5,E:5,F:4' then raise exception 'szóstka po liczebności: %', s; end if;
end $$;

-- Bezpośrednia zmiana statusu na ready z przeglądarki zablokowana
grant all on public.games to authenticated;
grant usage on schema auth to authenticated;
set local role authenticated;
do $$
begin
  update public.games set status = 'ready' where id = '40500000-0000-4000-8000-000000000001';
  raise exception 'status ready z przeglądarki';
exception when others then if sqlerrm not in ('poll_close_blocked:useTally:', 'game_write_forbidden') then raise; end if; -- 514: game_write_forbidden
end $$;
reset role;
select 'e21-poll-tally-405: OK' as wynik;
rollback;
