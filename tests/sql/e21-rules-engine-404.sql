-- Migracja 404 (E21): centralny silnik reguł, zmiana typu, pełny reset,
-- blokada aktywnego Control, walidacja tekstów obu edytorów.
-- Uruchomienie: lokalna baza wg docs/sql/local-db.md (schema.sql bez 404),
-- potem z katalogu repo: psql ... -d fam -f tests/sql/e21-rules-engine-404.sql
\set ON_ERROR_STOP 1
\set owner '40400000-0000-4000-8000-0000000000aa'
\set gp '40400000-0000-4000-8000-000000000001'
\set gt '40400000-0000-4000-8000-000000000002'
begin;
\ir ../../supabase/migrations/2026-10-20_404_e21_rules_engine.sql
grant all on public.games, public.questions, public.answers, public.qb_questions, public.question_bases to authenticated;
insert into auth.users(id,email) values (:'owner','o404@x.pl');
insert into public.games(id,owner_id,name,type,status) values (:'gp',:'owner','P404','prepared','draft');
insert into public.games(id,owner_id,name,type,status) values (:'gt',:'owner','T404','poll_points','draft');
-- 10 pytań po 3 odpowiedzi 40/30/30 (suma 100)
insert into public.questions(id,game_id,ord,text)
select ('40400000-0000-4000-8001-0000000000' || lpad(i::text,2,'0'))::uuid, :'gp', i, 'Pytanie ' || i from generate_series(1,10) i;
insert into public.answers(question_id,ord,text,fixed_points)
select q.id, a, 'Odp ' || a, case a when 1 then 40 else 30 end
from public.questions q, generate_series(1,3) a where q.game_id = :'gp';
insert into public.questions(id,game_id,ord,text)
select ('40400000-0000-4000-8002-0000000000' || lpad(i::text,2,'0'))::uuid, :'gt', i, 'Pytanie ' || i from generate_series(1,10) i;
insert into public.answers(question_id,ord,text,fixed_points)
select q.id, a, 'Odp ' || a, 0 from public.questions q, generate_series(1,3) a where q.game_id = :'gt';
select set_config('request.jwt.claim.sub',:'owner',true);

do $$
declare r jsonb; g uuid := '40400000-0000-4000-8000-000000000001';
begin
  -- znaki z czcionki: małe polskie/ukraińskie litery tak, emoji nie
  if not public.fam_display_has_glyph('ą') or not public.fam_display_has_glyph('ї') or public.fam_display_has_glyph('😀') then
    raise exception 'fam_display_has_glyph';
  end if;
  if public.fam_answer_clean(' Kawa 😀  z  mlekiem!!! ') <> 'Kawa z mlekiem!!!' then raise exception 'fam_answer_clean: %', public.fam_answer_clean(' Kawa 😀  z  mlekiem!!! '); end if;
  if public.fam_answer_clean('😀😀') <> '' then raise exception 'fam_answer_clean pusty'; end if;
  if public.fam_answer_invalid_chars('a😀b👍😀') <> array['😀','👍'] then raise exception 'fam_answer_invalid_chars'; end if;

  r := public.game_rules_compute(g, 'prepared', 'draft');
  if not (r->'play'->>'ok')::boolean or not (r->'readiness'->>'ok')::boolean then raise exception 'P 40/30/30: %', r->'play'; end if;
  if (r->'rules'->>'pts_min')::int <> 4 then raise exception 'pts_min'; end if;

  -- 3 pkt = brak; 4 pkt przechodzi próg
  update public.answers set fixed_points = 3 where question_id = '40400000-0000-4000-8001-000000000002' and ord = 3;
  r := public.game_rules_compute(g, 'prepared', 'draft');
  if r->'play'->>'code' <> 'answerMinPoints' or (r->'play'->'params'->>'ord')::int <> 2 then raise exception 'min 4: %', r->'play'; end if;
  update public.answers set fixed_points = 4 where question_id = '40400000-0000-4000-8001-000000000002' and ord = 3;
  if not (public.game_rules_compute(g, 'prepared', 'draft')->'play'->>'ok')::boolean then raise exception '4 pkt'; end if;

  -- suma 101 blokuje, suma < 100 nie
  update public.answers set fixed_points = 31 where question_id = '40400000-0000-4000-8001-000000000003' and ord = 3;
  r := public.game_rules_compute(g, 'prepared', 'draft');
  if r->'play'->>'code' <> 'sumTooBig' then raise exception 'suma 101: %', r->'play'; end if;
  update public.answers set fixed_points = 10 where question_id = '40400000-0000-4000-8001-000000000003' and ord = 3;

  -- pytanie bez odpowiedzi -> answersRange; pełna lista braków
  delete from public.answers where question_id = '40400000-0000-4000-8001-000000000004';
  r := public.game_rules_compute(g, 'prepared', 'draft');
  if r->'play'->>'code' <> 'answersRange' then raise exception 'brak odpowiedzi: %', r->'play'; end if;
  if jsonb_array_length(r->'readiness'->'issues') <> 1 then raise exception 'issues: %', r->'readiness'; end if;
end $$;

-- Aktywny Control blokuje edycję, zmianę typu i zapis treści; wygasły nie.
insert into public.control_runtime_sessions(game_id, owner_id) values (:'gp', :'owner');
do $$
declare r jsonb;
begin
  r := public.game_validate('40400000-0000-4000-8000-000000000001');
  if r->'edit'->>'code' <> 'controlActive' or r->'change_type'->>'code' <> 'controlActive' then raise exception 'controlActive: %', r->'edit'; end if;
  r := public.game_change_type('40400000-0000-4000-8000-000000000001', 'poll_text', false);
  if r->>'code' <> 'controlActive' then raise exception 'change_type control: %', r; end if;
end $$;
set local role authenticated;
do $$
begin
  begin
    insert into public.questions(game_id,ord,text) values ('40400000-0000-4000-8000-000000000001', 11, 'Nowe');
    raise exception 'insert przy aktywnym Control przeszedł';
  exception when others then
    if sqlerrm <> 'game_content_locked:control_active' then raise; end if;
  end;
end $$;
reset role;
update public.control_runtime_sessions set expires_at = now() - interval '1 second' where game_id = :'gp';
do $$
begin
  if not (public.game_validate('40400000-0000-4000-8000-000000000001')->'edit'->>'ok')::boolean then raise exception 'wygasły Control nadal blokuje'; end if;
end $$;

-- Walidacja tekstów z przeglądarki
set local role authenticated;
do $$
begin
  insert into public.questions(game_id,ord,text) values ('40400000-0000-4000-8000-000000000001', 11, repeat('x',100));
  begin
    insert into public.questions(game_id,ord,text) values ('40400000-0000-4000-8000-000000000001', 12, repeat('x',101));
    raise exception 'pytanie 101 przeszło';
  exception when others then if sqlerrm <> 'content_invalid:questionTooLong' then raise; end if; end;
  insert into public.answers(question_id,ord,text) values ('40400000-0000-4000-8001-000000000004', 1, 'żółć ЇЖАК');
  begin
    insert into public.answers(question_id,ord,text) values ('40400000-0000-4000-8001-000000000004', 2, 'kawa😀');
    raise exception 'emoji przeszło';
  exception when others then if sqlerrm <> 'content_invalid:answerChars:😀' then raise; end if; end;
end $$;
reset role;

-- Zmiana typu: preparowana -> punktowa zeruje punkty; -> tekstowa usuwa odpowiedzi
do $$
declare r jsonb; g uuid := '40400000-0000-4000-8000-000000000001';
begin
  r := public.game_change_type(g, 'poll_points', false);
  if not (r->>'ok')::boolean then raise exception 'P->AP: %', r; end if;
  if exists (select 1 from public.answers a join public.questions q on q.id=a.question_id where q.game_id=g and a.fixed_points<>0) then raise exception 'punkty zostały'; end if;
  if (select type::text from public.games where id=g) <> 'poll_points' then raise exception 'typ'; end if;
  r := public.game_change_type(g, 'poll_text', false);
  if exists (select 1 from public.answers a join public.questions q on q.id=a.question_id where q.game_id=g) then raise exception 'odpowiedzi zostały'; end if;
  r := public.game_change_type(g, 'market', false);
  if r->>'error' <> 'invalid_type' then raise exception 'market: %', r; end if;
end $$;

-- Zamknięta ankieta: bez resetu nic się nie zmienia; z resetem pełny reset i szkic
do $$
declare r jsonb; g uuid := '40400000-0000-4000-8000-000000000002'; k text; s uuid; q uuid := '40400000-0000-4000-8002-000000000001';
begin
  insert into public.poll_sessions(id, game_id, question_id, question_ord, is_open) values (gen_random_uuid(), g, q, 1, false) returning id into s;
  insert into public.poll_votes(game_id, poll_session_id, question_id, answer_id, question_ord, answer_ord, voter_token)
  select g, s, q, a.id, 1, 1, 'voter-0001' from public.answers a where a.question_id = q and a.ord = 1;
  set local session_replication_role = replica;
  update public.games set status = 'ready' where id = g;
  update public.answers a set fixed_points = 30 from public.questions qq where qq.id=a.question_id and qq.game_id=g;
  set local session_replication_role = origin;
  select share_key_poll into k from public.games where id = g;
  r := public.game_change_type(g, 'prepared', false);
  if r->>'error' <> 'needs_reset' then raise exception 'needs_reset: %', r; end if;
  if (select status::text from public.games where id=g) <> 'ready' then raise exception 'zmiana bez resetu'; end if;
  r := public.game_change_type(g, 'prepared', true);
  if not (r->>'ok')::boolean or not (r->>'reset')::boolean then raise exception 'reset: %', r; end if;
  if exists (select 1 from public.poll_votes where game_id=g) or exists (select 1 from public.poll_sessions where game_id=g) then raise exception 'głosy/sesje zostały'; end if;
  if (select share_key_poll from public.games where id=g) = k then raise exception 'stary klucz'; end if;
  if (select type::text || '/' || status::text from public.games where id=g) <> 'prepared/draft' then raise exception 'wynik'; end if;
  if exists (select 1 from public.answers a join public.questions qq on qq.id=a.question_id where qq.game_id=g and a.fixed_points<>0) then raise exception 'punkty po resecie'; end if;
end $$;

-- Baza pytań: te same zasady przy zapisie
insert into public.question_bases(id, owner_id, name) values ('40400000-0000-4000-8000-0000000000b1', :'owner', 'B404');
set local role authenticated;
do $$
begin
  insert into public.qb_questions(base_id, ord, payload) values ('40400000-0000-4000-8000-0000000000b1', 1, '{"text":"Ok","answers":[{"text":"źdźbło"}]}');
  begin
    insert into public.qb_questions(base_id, ord, payload) values ('40400000-0000-4000-8000-0000000000b1', 2, '{"text":"Ok","answers":[{"text":"x👍"}]}');
    raise exception 'baza: emoji przeszło';
  exception when others then if sqlerrm <> 'content_invalid:answerChars:👍' then raise; end if; end;
  begin
    insert into public.qb_questions(base_id, ord, payload) values ('40400000-0000-4000-8000-0000000000b1', 3, jsonb_build_object('text', repeat('y',101)));
    raise exception 'baza: pytanie 101 przeszło';
  exception when others then if sqlerrm <> 'content_invalid:questionTooLong' then raise; end if; end;
end $$;
reset role;
select 'e21-rules-engine-404: OK' as wynik;
rollback;
