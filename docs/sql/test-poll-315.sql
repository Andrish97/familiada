-- Test lokalny migracji 315 (docs/sql/local-db.md): ankiety — poll_stopped, Zatrzymaj / Wznów / Podlicz.
-- Uruchomienie po załadowaniu schematu i migracji (psql -1 -f ...315...sql):
--   psql -h <dir> -p <port> -U postgres -d e15 -v ON_ERROR_STOP=1 -f docs/sql/test-poll-315.sql
-- Wszystko w jednej transakcji, na końcu ROLLBACK. Każdy błąd asercji = RAISE EXCEPTION.
\set ON_ERROR_STOP on
BEGIN;

create function pg_temp.chk(c boolean, m text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'TEST NIE PRZESZEDL: %', m; end if;
  raise notice 'ok: %', m;
end $$;

-- oczekuje błędu zawierającego p_like (zapytanie wykonane w podtransakcji)
create function pg_temp.fails(p_sql text, p_like text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_like || '%' then
      raise notice 'ok: % (błąd: %)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'TEST NIE PRZESZEDL: % — oczekiwano błędu %, jest: %', p_msg, p_like, sqlerrm;
  end;
  raise exception 'TEST NIE PRZESZEDL: % — oczekiwano błędu %, ale przeszło', p_msg, p_like;
end $$;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u, ''), true)
$$;

-- gra: p_type, 10 pytań, dla punktacji 4 odpowiedzi na pytanie
create function pg_temp.mk_game(p_id uuid, p_owner uuid, p_type text, p_name text) returns void language plpgsql as $$
declare qid uuid; i int; j int;
begin
  insert into public.games(id, owner_id, name, type, status) values (p_id, p_owner, p_name, p_type::public.game_type, 'draft');
  for i in 1..10 loop
    insert into public.questions(game_id, ord, text) values (p_id, i, 'Pytanie ' || i) returning id into qid;
    if p_type = 'poll_points' then
      for j in 1..4 loop
        insert into public.answers(question_id, ord, text, fixed_points) values (qid, j, 'Odp ' || j, 0);
      end loop;
    end if;
  end loop;
end $$;

create function pg_temp.key(p_id uuid) returns text language sql as $$
  select share_key_poll from public.games where id = p_id
$$;
create function pg_temp.st(p_id uuid) returns text language sql as $$
  select status::text from public.games where id = p_id
$$;

-- głos punktacji: wszystkie pytania na odpowiedź nr p_ord (przez publiczny poll_points_vote_batch)
create function pg_temp.vote_points(p_id uuid, p_key text, p_token text, p_ord int) returns void language plpgsql as $$
declare items jsonb;
begin
  select jsonb_agg(jsonb_build_object('question_id', q.id, 'answer_id', a.id)) into items
  from public.questions q join public.answers a on a.question_id = q.id and a.ord = p_ord
  where q.game_id = p_id;
  perform public.poll_points_vote_batch(p_id, p_key, p_token, items);
end $$;

-- wpis tekstowy: wszystkie pytania ta sama odpowiedź
create function pg_temp.vote_text(p_id uuid, p_key text, p_token text, p_text text) returns void language plpgsql as $$
declare items jsonb;
begin
  select jsonb_agg(jsonb_build_object('question_id', q.id, 'answer_raw', p_text, 'answer_norm', lower(p_text))) into items
  from public.questions q where q.game_id = p_id;
  perform public.poll_text_submit_batch(p_id, p_key, p_token, items);
end $$;

insert into auth.users(id, email) values
 ('aaaaaaaa-0000-0000-0000-00000000a315', 'a315@test.pl'),
 ('bbbbbbbb-0000-0000-0000-00000000b315', 'b315@test.pl');
insert into public.profiles(id, email, username) values
 ('aaaaaaaa-0000-0000-0000-00000000a315', 'a315@test.pl', 'a315'),
 ('bbbbbbbb-0000-0000-0000-00000000b315', 'b315@test.pl', 'b315')
on conflict (id) do update set email = excluded.email;

select pg_temp.mk_game('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000a315', 'poll_points', 'Punktacja 1');
select pg_temp.mk_game('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000a315', 'poll_points', 'Punktacja 2 (bez głosów)');
select pg_temp.mk_game('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000a315', 'poll_points', 'Punktacja 3 (abort)');
select pg_temp.mk_game('11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000a315', 'poll_points', 'Punktacja 4 (stare RPC)');
select pg_temp.mk_game('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000a315', 'poll_text', 'Tekst 1');
select pg_temp.mk_game('22222222-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000a315', 'poll_text', 'Tekst 2 (stare RPC)');
insert into public.games(id, owner_id, name, type, status) values
 ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000a315', 'Preparowana', 'prepared', 'draft');

-- ============================================================
-- 0. enum, ograniczenia
-- ============================================================
select pg_temp.chk(exists(select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'game_status' and e.enumlabel = 'poll_stopped'), 'enum game_status ma poll_stopped');
select pg_temp.fails($$update public.games set status = 'poll_stopped' where id = '33333333-0000-0000-0000-000000000001'$$, 'games_poll_status_ok', 'gra preparowana nie może być poll_stopped');

-- ============================================================
-- 1. PUNKTACJA: open -> głosy -> stop -> odrzucone głosy -> resume -> stop -> tally
-- ============================================================
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000a315');
select public.poll_open('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'));
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000001') = 'poll_open', 'poll_open (stary RPC) działa');

-- zaproszenie (czekające) i kod QR ankiety, które mają przeżyć stop, a zniknąć po tally
insert into public.poll_tasks(owner_id, recipient_email, game_id, poll_type, share_key_poll, token)
 values ('aaaaaaaa-0000-0000-0000-00000000a315', 'inv@test.pl', '11111111-0000-0000-0000-000000000001', 'poll_points',
         pg_temp.key('11111111-0000-0000-0000-000000000001'), '5a5a5a5a-0000-0000-0000-000000000001');
insert into public.device_connect_codes(code, owner_id, game_id, device_type, share_key)
 values ('315315', 'aaaaaaaa-0000-0000-0000-00000000a315', '11111111-0000-0000-0000-000000000001', 'poll_qr', pg_temp.key('11111111-0000-0000-0000-000000000001'));

-- 6 głosów: 3x odp 1, 2x odp 2, 1x odp 3
select pg_temp.vote_points('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'), 'voter-000' || n, case when n <= 3 then 1 when n <= 5 then 2 else 3 end)
from generate_series(1, 6) n;

select pg_temp.chk((select count(*) from public.poll_votes where game_id = '11111111-0000-0000-0000-000000000001') = 60, '6 głosujących x 10 pytań = 60 głosów');

-- plakietki: otwarta ankieta, 6 głosujących
select pg_temp.chk((select votes from public.polls_vote_counts() where game_id = '11111111-0000-0000-0000-000000000001') = 6
  and (select status from public.polls_vote_counts() where game_id = '11111111-0000-0000-0000-000000000001') = 'poll_open', 'polls_vote_counts: otwarta, 6 głosujących');

-- nie-właściciel
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000b315');
select pg_temp.fails($$select public.poll_stop('11111111-0000-0000-0000-000000000001')$$, 'not_owner', 'poll_stop: nie-właściciel odrzucony');
select pg_temp.fails($$select public.poll_resume('11111111-0000-0000-0000-000000000001')$$, 'not_owner', 'poll_resume: nie-właściciel odrzucony');
select pg_temp.fails($$select public.poll_points_tally('11111111-0000-0000-0000-000000000001')$$, 'not_owner', 'poll_points_tally: nie-właściciel odrzucony');
select pg_temp.fails($$select public.poll_text_tally_draft_save('22222222-0000-0000-0000-000000000001', '{}')$$, 'not_owner', 'draft_save: nie-właściciel odrzucony');
select pg_temp.fails($$select public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')$$, 'not_owner', 'draft_get: nie-właściciel odrzucony');
select pg_temp.fails($$select public.poll_text_tally_apply('22222222-0000-0000-0000-000000000001', '{"items":[]}')$$, 'not_owner', 'tally_apply: nie-właściciel odrzucony');
select pg_temp.chk((select count(*) from public.polls_vote_counts()) = 0, 'polls_vote_counts: obcy właściciel nie widzi cudzych');
select pg_temp.as_user(null);
select pg_temp.fails($$select public.poll_stop('11111111-0000-0000-0000-000000000001')$$, 'not_authenticated', 'poll_stop: bez zalogowania odrzucony');

-- uprawnienia wykonania: anon nie wywoła RPC właściciela
do $$
begin
  execute 'set local role anon';
  begin
    perform public.poll_stop('11111111-0000-0000-0000-000000000001');
    execute 'reset role';
    raise exception 'TEST NIE PRZESZEDL: anon wywołał poll_stop';
  exception when insufficient_privilege then
    execute 'reset role';
    raise notice 'ok: anon nie ma EXECUTE na poll_stop';
  end;
  execute 'set local role anon';
  begin
    perform public.poll_state('11111111-0000-0000-0000-000000000001', 'x');
    execute 'reset role';
    raise notice 'ok: anon ma EXECUTE na poll_state';
  exception when insufficient_privilege then
    execute 'reset role';
    raise exception 'TEST NIE PRZESZEDL: anon nie może wywołać poll_state';
  end;
  execute 'set local role anon';
  begin
    perform public._poll_finish_tally('11111111-0000-0000-0000-000000000001');
    execute 'reset role';
    raise exception 'TEST NIE PRZESZEDL: anon wywołał _poll_finish_tally';
  exception when insufficient_privilege then
    execute 'reset role';
    raise notice 'ok: anon nie ma EXECUTE na funkcje wewnętrzne';
  end;
end $$;

-- stop
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000a315');
select pg_temp.chk((select (public.poll_stop('11111111-0000-0000-0000-000000000001')->>'changed')::boolean), 'poll_stop zmienia stan');
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000001') = 'poll_stopped', 'status = poll_stopped');
select pg_temp.chk(not (public.poll_stop('11111111-0000-0000-0000-000000000001')->>'changed')::boolean, 'poll_stop idempotentne');

-- klucz, zaproszenie, kod QR i głosy zostają; sesje otwarte
select pg_temp.chk(exists(select 1 from public.poll_tasks where token = '5a5a5a5a-0000-0000-0000-000000000001'), 'zaproszenie przeżyło stop');
select pg_temp.chk(exists(select 1 from public.device_connect_codes where code = '315315'), 'kod QR przeżył stop');
select pg_temp.chk((select count(*) from public.poll_votes where game_id = '11111111-0000-0000-0000-000000000001') = 60, 'głosy zachowane po stop');
select pg_temp.chk((select votes from public.polls_vote_counts() where game_id = '11111111-0000-0000-0000-000000000001') = 6
  and (select status from public.polls_vote_counts() where game_id = '11111111-0000-0000-0000-000000000001') = 'poll_stopped', 'polls_vote_counts: zatrzymana, 6 głosujących');

-- strony głosowania: stan rozróżnialny
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'))->>'state') = 'stopped', 'poll_state = stopped');
select pg_temp.chk((public.get_poll_game('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'))->'game'->>'status') = 'poll_stopped', 'get_poll_game zwraca status poll_stopped (klucz ważny)');
select pg_temp.fails($$select public.poll_get_payload('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'))$$, 'not open', 'poll_get_payload odrzuca zatrzymaną');
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', 'zly-klucz')->>'state') = 'expired', 'poll_state: zły klucz = expired');
select pg_temp.chk((public.poll_state('99999999-0000-0000-0000-000000000009', 'x')->>'state') = 'not_found', 'poll_state: brak gry = not_found');

-- głosy odrzucone przez bazę (wszystkie ścieżki)
select pg_temp.fails($$select pg_temp.vote_points('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'), 'voter-0099', 1)$$, 'not open', 'poll_points_vote_batch odrzucony w stop');
select pg_temp.fails($$select public.poll_points_vote('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'), (select id from public.questions where game_id='11111111-0000-0000-0000-000000000001' and ord=1), (select a.id from public.answers a join public.questions q on q.id=a.question_id where q.game_id='11111111-0000-0000-0000-000000000001' and q.ord=1 and a.ord=1), 'voter-0099')$$, 'not open', 'poll_points_vote odrzucony w stop');
select pg_temp.chk((public.poll_vote(pg_temp.key('11111111-0000-0000-0000-000000000001'), 1, 1, 'voter-0099')->>'reason') = 'poll_closed', 'poll_vote (ord) odrzucony w stop');
select pg_temp.fails($$select public.poll_vote_game('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'), (select id from public.questions where game_id='11111111-0000-0000-0000-000000000001' and ord=1), (select a.id from public.answers a join public.questions q on q.id=a.question_id where q.game_id='11111111-0000-0000-0000-000000000001' and q.ord=1 and a.ord=1), 'voter-0099')$$, 'closed', 'poll_vote_game odrzucony w stop');
select pg_temp.fails($$select public.poll_vote_points('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'), (select id from public.questions where game_id='11111111-0000-0000-0000-000000000001' and ord=1), (select a.id from public.answers a join public.questions q on q.id=a.question_id where q.game_id='11111111-0000-0000-0000-000000000001' and q.ord=1 and a.ord=1), 'voter-0099')$$, 'closed', 'poll_vote_points odrzucony w stop');
select pg_temp.fails($$select public.poll_points_vote_batch_owner('11111111-0000-0000-0000-000000000001', '[]'::jsonb, 'voter-0099')$$, 'not open', 'poll_points_vote_batch_owner odrzucony w stop');
select pg_temp.fails($$select public.poll_text_submit_batch_owner('11111111-0000-0000-0000-000000000001', '[]'::jsonb, 'voter-0099')$$, 'not open', 'poll_text_submit_batch_owner odrzucony w stop');
select pg_temp.chk((select count(*) from public.poll_votes where game_id = '11111111-0000-0000-0000-000000000001') = 60, 'żaden odrzucony głos nie wszedł');

-- game_validate: zatrzymana = jak otwarta (edycja zablokowana), wejście do ankiety ok
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'edit'->>'code') = 'pollStoppedNoEdit', 'game_validate: edycja zablokowana (pollStoppedNoEdit)');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'play'->>'code') = 'playAfterPoll', 'game_validate: gra zablokowana (playAfterPoll)');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'poll_entry'->>'ok')::boolean, 'game_validate: poll_entry ok');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'poll_open'->>'code') = 'pollStopped', 'game_validate: poll_open -> pollStopped');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'export'->>'code') = 'pollStoppedNoExport', 'game_validate: eksport zablokowany');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'poll_stop'->>'ok')::boolean = false
  and (public.game_validate('11111111-0000-0000-0000-000000000001')->'poll_resume'->>'ok')::boolean, 'game_validate: poll_stop nie, poll_resume tak');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'poll_close'->>'ok')::boolean, 'game_validate: poll_close (gotowość do podliczenia) ok dla zatrzymanej');
select pg_temp.chk((select rules_state->'edit'->>'code' from public.games where id = '11111111-0000-0000-0000-000000000001') = 'pollStoppedNoEdit', 'rules_state przeliczony po zmianie statusu');
select pg_temp.chk(not (select can_edit from public.game_action_state('11111111-0000-0000-0000-000000000001')), 'game_action_state: can_edit = false');
select pg_temp.chk((public.game_reset_poll_for_edit('11111111-0000-0000-0000-000000000001')->>'error') = 'poll_stopped', 'game_reset_poll_for_edit odmawia dla zatrzymanej');
grant usage on schema public to authenticated;
grant select, update on public.questions to authenticated;
grant select on public.games to authenticated;
set local role authenticated;
select pg_temp.fails($$update public.questions set text = 'zmiana' where game_id = '11111111-0000-0000-0000-000000000001'$$, 'game_content_locked:poll_stopped', 'treść pytań zablokowana w stop');
reset role;

-- zaproszenie w stop: rozpoznawalne
select pg_temp.as_user(null);
select pg_temp.chk((public.poll_go_resolve('5a5a5a5a-0000-0000-0000-000000000001')->>'error') = 'poll_stopped', 'poll_go_resolve: zaproszenie -> poll_stopped');
select pg_temp.chk((public.poll_task_resolve('5a5a5a5a-0000-0000-0000-000000000001')->>'error') = 'poll_stopped', 'poll_task_resolve: zaproszenie -> poll_stopped');

-- resume
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000a315');
select pg_temp.chk((public.poll_resume('11111111-0000-0000-0000-000000000001')->>'changed')::boolean, 'poll_resume zmienia stan');
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000001') = 'poll_open', 'po resume status = poll_open');
select pg_temp.chk((select count(*) from public.poll_votes where game_id = '11111111-0000-0000-0000-000000000001') = 60, 'głosy zachowane po resume');
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'))->>'state') = 'open', 'poll_state = open po resume');
select pg_temp.vote_points('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'), 'voter-0007', 3);
select pg_temp.chk((select count(distinct voter_token) from public.poll_votes where game_id = '11111111-0000-0000-0000-000000000001') = 7, 'po resume głosowanie znów działa (7 głosujących)');
select pg_temp.fails($$select public.poll_resume('11111111-0000-0000-0000-000000000002')$$, 'poll_not_stopped', 'resume z draftu odrzucone');
select pg_temp.fails($$select public.poll_stop('11111111-0000-0000-0000-000000000002')$$, 'poll_not_open', 'stop z draftu odrzucone');
select pg_temp.fails($$select public.poll_points_tally('11111111-0000-0000-0000-000000000001')$$, 'poll_not_stopped', 'tally z otwartej odrzucone (tylko po stop)');

-- tally
select public.poll_stop('11111111-0000-0000-0000-000000000001');
select pg_temp.fails($$select public.poll_text_tally_apply('11111111-0000-0000-0000-000000000001', '{"items":[]}')$$, 'wrong_type', 'tally tekstowy na punktacji odrzucony');
create temp table old_key(k text);
insert into old_key select pg_temp.key('11111111-0000-0000-0000-000000000001');
select pg_temp.chk((public.poll_points_tally('11111111-0000-0000-0000-000000000001')->>'status') = 'ready', 'poll_points_tally -> ready');
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000001') = 'ready', 'status = ready po tally');
select pg_temp.chk((select array_agg(fixed_points order by a.ord) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '11111111-0000-0000-0000-000000000001' and q.ord = 1) = array[38, 25, 25, 12],
  'punkty pytania 1 = 38/25/25/12 (głosy 3,2,2,0->1)');
select pg_temp.chk(not exists(select 1 from (
    select q.id, sum(a.fixed_points) s, min(a.fixed_points) m from public.questions q join public.answers a on a.question_id = q.id
    where q.game_id = '11111111-0000-0000-0000-000000000001' group by q.id) x where x.s <> 100 or x.m < 1), 'każde pytanie: suma 100, minimum 1');
select pg_temp.chk(pg_temp.key('11111111-0000-0000-0000-000000000001') <> (select k from old_key), 'klucz ankiety zrotowany po tally');
select pg_temp.chk(not exists(select 1 from public.poll_tasks where token = '5a5a5a5a-0000-0000-0000-000000000001'), 'czekające zaproszenie zakończone (usunięte) po tally');
select pg_temp.chk(not exists(select 1 from public.device_connect_codes where code = '315315'), 'kod QR skasowany po tally');
select pg_temp.chk(not exists(select 1 from public.poll_sessions where game_id = '11111111-0000-0000-0000-000000000001' and is_open), 'sesje zamknięte po tally');
-- stary link
select pg_temp.as_user(null);
select pg_temp.fails($$select public.get_poll_game('11111111-0000-0000-0000-000000000001', (select k from old_key))$$, 'forbidden', 'get_poll_game ze starym kluczem: forbidden (wygasł)');
select pg_temp.fails($$select pg_temp.vote_points('11111111-0000-0000-0000-000000000001', (select k from old_key), 'voter-0100', 1)$$, 'Invalid poll key', 'głos starym kluczem po tally odrzucony');
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', (select k from old_key))->>'state') = 'ended', 'poll_state: stary link po tally = ended');
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', 'cos-innego')->>'state') = 'expired', 'poll_state: obcy klucz = expired');
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'))->>'state') = 'ended', 'poll_state: nowy klucz po tally = ended');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000a315');
select pg_temp.chk((select count(*) from public.polls_vote_counts()) = 0, 'polls_vote_counts: zakończona nie jest w plakietkach');
select pg_temp.chk((public.game_validate('11111111-0000-0000-0000-000000000001')->'play'->>'ok')::boolean, 'game_validate: po tally można grać');

-- ponowne uruchomienie po tally czyści klucz zakończonej ankiety
select public.poll_open('11111111-0000-0000-0000-000000000001', pg_temp.key('11111111-0000-0000-0000-000000000001'));
select pg_temp.chk((select poll_ended_key from public.games where id = '11111111-0000-0000-0000-000000000001') is null, 'nowe uruchomienie czyści poll_ended_key');
select pg_temp.chk((public.poll_state('11111111-0000-0000-0000-000000000001', (select k from old_key))->>'state') = 'expired', 'po ponownym uruchomieniu stary link = expired');

-- tally bez wystarczających głosów (gra 2: 0 głosów)
select public.poll_open('11111111-0000-0000-0000-000000000002', pg_temp.key('11111111-0000-0000-0000-000000000002'));
select public.poll_stop('11111111-0000-0000-0000-000000000002');
select pg_temp.fails($$select public.poll_points_tally('11111111-0000-0000-0000-000000000002')$$, 'poll_close_blocked:closeMinPoints:', 'tally bez głosów zablokowany (minimum odpowiedzi)');
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000002') = 'poll_stopped', 'zablokowany tally nie zmienia stanu');

-- ============================================================
-- 2. ABORT z poll_stopped
-- ============================================================
select public.poll_open('11111111-0000-0000-0000-000000000003', pg_temp.key('11111111-0000-0000-0000-000000000003'));
select pg_temp.vote_points('11111111-0000-0000-0000-000000000003', pg_temp.key('11111111-0000-0000-0000-000000000003'), 'voter-0301', 1);
select public.poll_stop('11111111-0000-0000-0000-000000000003');
create temp table old_key3(k text);
insert into old_key3 select pg_temp.key('11111111-0000-0000-0000-000000000003');
select pg_temp.chk((public.poll_abort('11111111-0000-0000-0000-000000000003')->>'ok')::boolean, 'poll_abort działa z poll_stopped');
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000003') = 'draft', 'po abort status = draft');
select pg_temp.chk(not exists(select 1 from public.poll_votes where game_id = '11111111-0000-0000-0000-000000000003'), 'abort usuwa głosy');
select pg_temp.chk(pg_temp.key('11111111-0000-0000-0000-000000000003') <> (select k from old_key3), 'abort rotuje klucz');
select pg_temp.fails($$select public.poll_abort('33333333-0000-0000-0000-000000000001')$$, 'not_a_poll', 'abort preparowanej odrzucony');

-- ============================================================
-- 3. STARE RPC nadal działają (punktacja i tekst)
-- ============================================================
select public.poll_open('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'));
select pg_temp.vote_points('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'), 'voter-0401', 1);
select pg_temp.vote_points('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'), 'voter-0402', 2);
select pg_temp.vote_points('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'), 'voter-0403', 3);
select pg_temp.vote_points('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'), 'voter-0404', 1);
select pg_temp.vote_points('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'), 'voter-0405', 2);
select pg_temp.chk((select count(*) from public.polls_hub_list_polls() where game_id = '11111111-0000-0000-0000-000000000004' and poll_state = 'open') = 1, 'polls_hub_list_polls: otwarta = open');
select public.poll_points_close_and_normalize('11111111-0000-0000-0000-000000000004', pg_temp.key('11111111-0000-0000-0000-000000000004'));
select pg_temp.chk(pg_temp.st('11111111-0000-0000-0000-000000000004') = 'ready', 'stare poll_points_close_and_normalize -> ready');
select pg_temp.chk(not exists(select 1 from (
    select q.id, sum(a.fixed_points) s, min(a.fixed_points) m from public.questions q join public.answers a on a.question_id = q.id
    where q.game_id = '11111111-0000-0000-0000-000000000004' group by q.id) x where x.s <> 100 or x.m < 1), 'stara ścieżka: nadal suma 100, minimum 1 (wspólna normalizacja)');
select pg_temp.chk((select array_agg(fixed_points order by a.ord) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '11111111-0000-0000-0000-000000000004' and q.ord = 1) = array[33, 33, 17, 17], 'stara ścieżka: 2,2,1,0->1 => 33/33/17/17');
select pg_temp.chk((public.poll_abort('11111111-0000-0000-0000-000000000004')->>'ok')::boolean and pg_temp.st('11111111-0000-0000-0000-000000000004') = 'draft', 'stare poll_abort z ready działa');

-- tekst, stara ścieżka: poll_text_close_apply
select public.poll_open('22222222-0000-0000-0000-000000000002', pg_temp.key('22222222-0000-0000-0000-000000000002'));
select pg_temp.vote_text('22222222-0000-0000-0000-000000000002', pg_temp.key('22222222-0000-0000-0000-000000000002'), 'voter-t201', 'kot');
select pg_temp.vote_text('22222222-0000-0000-0000-000000000002', pg_temp.key('22222222-0000-0000-0000-000000000002'), 'voter-t202', 'pies');
select pg_temp.vote_text('22222222-0000-0000-0000-000000000002', pg_temp.key('22222222-0000-0000-0000-000000000002'), 'voter-t203', 'ryba');
select public.poll_text_close_apply('22222222-0000-0000-0000-000000000002', pg_temp.key('22222222-0000-0000-0000-000000000002'),
  (select jsonb_build_object('items', jsonb_agg(jsonb_build_object('question_id', q.id, 'answers',
     jsonb_build_array(jsonb_build_object('text', 'a', 'points', 50), jsonb_build_object('text', 'b', 'points', 30), jsonb_build_object('text', 'c', 'points', 20)))))
   from public.questions q where q.game_id = '22222222-0000-0000-0000-000000000002'));
select pg_temp.chk(pg_temp.st('22222222-0000-0000-0000-000000000002') = 'ready', 'stare poll_text_close_apply -> ready');
select pg_temp.chk(pg_temp.key('22222222-0000-0000-0000-000000000002') is not null, 'stara ścieżka nie rotuje klucza (bez zmian zachowania)');

-- ============================================================
-- 4. TEKST: szkic, tally, reguły
-- ============================================================
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000a315');
select public.poll_open('22222222-0000-0000-0000-000000000001', pg_temp.key('22222222-0000-0000-0000-000000000001'));
select pg_temp.vote_text('22222222-0000-0000-0000-000000000001', pg_temp.key('22222222-0000-0000-0000-000000000001'), 'voter-t101', 'Kot');
select pg_temp.vote_text('22222222-0000-0000-0000-000000000001', pg_temp.key('22222222-0000-0000-0000-000000000001'), 'voter-t102', 'Pies');
select pg_temp.vote_text('22222222-0000-0000-0000-000000000001', pg_temp.key('22222222-0000-0000-0000-000000000001'), 'voter-t103', 'Kot');
select pg_temp.fails($$select public.poll_text_tally_draft_save('22222222-0000-0000-0000-000000000001', '{"a":1}')$$, 'poll_not_stopped', 'draft_save tylko w stop');
select pg_temp.chk((public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')->'draft') = 'null'::jsonb, 'draft_get w open: null');
select pg_temp.chk((select votes from public.polls_vote_counts() where game_id = '22222222-0000-0000-0000-000000000001') = 3, 'polls_vote_counts (tekst): 3 głosujących');
select public.poll_stop('22222222-0000-0000-0000-000000000001');
select pg_temp.fails($$select pg_temp.vote_text('22222222-0000-0000-0000-000000000001', pg_temp.key('22222222-0000-0000-0000-000000000001'), 'voter-t104', 'Ryba')$$, 'not open', 'poll_text_submit_batch odrzucony w stop');
select pg_temp.fails($$select public.poll_text_submit('22222222-0000-0000-0000-000000000001', pg_temp.key('22222222-0000-0000-0000-000000000001'), (select id from public.questions where game_id='22222222-0000-0000-0000-000000000001' and ord=1), 'voter-t104', 'Ryba', 'ryba')$$, 'not open', 'poll_text_submit odrzucony w stop');
select pg_temp.chk((select count(*) from public.poll_text_entries where game_id = '22222222-0000-0000-0000-000000000001') = 30, 'żaden odrzucony wpis tekstowy nie wszedł');
select pg_temp.chk((public.game_validate('22222222-0000-0000-0000-000000000001')->'poll_close'->>'code') = 'closeMinText', 'tekst: poll_close = closeMinText przy 2 różnych odpowiedziach');

-- szkic scalania
select pg_temp.chk((public.poll_text_tally_draft_save('22222222-0000-0000-0000-000000000001', '{"model":[{"q":1,"items":[{"text":"kot","count":2}]}]}')->>'ok')::boolean, 'draft_save zapisuje');
select pg_temp.chk((public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')->'draft'->'model'->0->>'q') = '1'
  and (public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')->>'saved_at') is not null, 'draft_get zwraca zapisany szkic i saved_at');
select public.poll_text_tally_draft_save('22222222-0000-0000-0000-000000000001', '{"v":2}');
select pg_temp.chk((public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')->'draft'->>'v') = '2'
  and (select count(*) from public.poll_tally_drafts where game_id = '22222222-0000-0000-0000-000000000001') = 1, 'draft_save nadpisuje (jeden wiersz)');
select pg_temp.fails($$select public.poll_text_tally_draft_save('11111111-0000-0000-0000-000000000004', '{}')$$, 'wrong_type', 'draft_save tylko dla tekstu');
select pg_temp.fails($$select public.poll_text_tally_draft_save('22222222-0000-0000-0000-000000000001', jsonb_build_object('x', repeat('a', 600000)))$$, 'draft_too_large', 'draft_save: limit rozmiaru');
-- resume/stop zachowuje szkic
select public.poll_resume('22222222-0000-0000-0000-000000000001');
select pg_temp.chk((select count(*) from public.poll_tally_drafts where game_id = '22222222-0000-0000-0000-000000000001') = 1, 'szkic przeżył resume');
select pg_temp.chk((public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')->'draft') = 'null'::jsonb, 'draft_get w open: null (szkic ukryty)');
select public.poll_stop('22222222-0000-0000-0000-000000000001');
select pg_temp.chk((public.poll_text_tally_draft_get('22222222-0000-0000-0000-000000000001')->'draft'->>'v') = '2', 'szkic wraca po ponownym stop');

-- funkcja punktów: przypadki
select pg_temp.chk((select array_agg(points order by ord) from public._poll_text_tally_points('[{"text":"kot","count":50},{"text":"pies","count":30},{"text":"ryba","count":15},{"text":"chomik","count":5}]')) = array[50,30,15,5], 'punkty 50/30/15/5 -> 50,30,15,5 (suma 100)');
select pg_temp.chk((select array_agg(points order by ord) from public._poll_text_tally_points('[{"text":"a","count":7},{"text":"b","count":7},{"text":"c","count":7}]')) = array[34,33,32], 'trzy równe: 34,33,32 (remisy rozbite w dół, jak w kliencie)');
select pg_temp.chk((select array_agg(points order by ord) from public._poll_text_tally_points('[{"text":"a","count":90},{"text":"b","count":5},{"text":"c","count":3},{"text":"d","count":1},{"text":"e","count":1}]')) = array[90,5,3], 'odpowiedzi < 3 pkt odpadają');
select pg_temp.chk((select count(*) from public._poll_text_tally_points('[{"text":"a","count":10},{"text":"b","count":9},{"text":"c","count":8},{"text":"d","count":7},{"text":"e","count":6},{"text":"f","count":5},{"text":"g","count":4},{"text":"h","count":3}]')) = 6, 'maksymalnie 6 odpowiedzi');
select pg_temp.chk((select atext from public._poll_text_tally_points('[{"text":"  Bardzo długa odpowiedź tekstowa  ","count":5},{"text":"b","count":3},{"text":"c","count":2}]') where ord = 1) = 'Bardzo długa odpo'
  and char_length('Bardzo długa odpo') = 17, 'tekst przycięty do 17 znaków (trim + clip)');
select pg_temp.chk((select count(*) from public._poll_text_tally_points('[{"text":"Kot","count":5},{"text":"kot ","count":3},{"text":"","count":9},{"text":"x","count":0}]')) = 1, 'duplikaty (wielkość liter) sumowane, puste i zerowe odpadają');
select pg_temp.chk((select count(*) from public._poll_text_tally_points('null')) = 0, 'null -> brak wierszy');

-- tally tekstowy: za mało odpowiedzi w jednym pytaniu -> blokada, nic nie zapisane
create temp table payload_bad as
select jsonb_build_object('items', jsonb_agg(jsonb_build_object('question_id', q.id, 'answers',
  case when q.ord = 4 then '[{"text":"kot","count":9},{"text":"pies","count":1}]'::jsonb
       else '[{"text":"kot","count":50},{"text":"pies","count":30},{"text":"ryba","count":15},{"text":"chomik","count":5}]'::jsonb end))) as p
from public.questions q where q.game_id = '22222222-0000-0000-0000-000000000001';
select pg_temp.fails($$select public.poll_text_tally_apply('22222222-0000-0000-0000-000000000001', (select p from payload_bad))$$, 'poll_close_blocked:closeMinText:4', 'tally tekstowy: min 3 odpowiedzi (pytanie 4)');
select pg_temp.chk(pg_temp.st('22222222-0000-0000-0000-000000000001') = 'poll_stopped'
  and not exists(select 1 from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '22222222-0000-0000-0000-000000000001'), 'zablokowany tally nic nie zapisał');
-- brak pytania w payloadzie
create temp table payload_missing as
select jsonb_build_object('items', jsonb_agg(jsonb_build_object('question_id', q.id, 'answers',
  '[{"text":"kot","count":50},{"text":"pies","count":30},{"text":"ryba","count":15}]'::jsonb))) as p
from public.questions q where q.game_id = '22222222-0000-0000-0000-000000000001' and q.ord <> 7;
select pg_temp.fails($$select public.poll_text_tally_apply('22222222-0000-0000-0000-000000000001', (select p from payload_missing))$$, 'poll_close_blocked:closeMinText:7', 'tally tekstowy: brak pytania w payloadzie');
select pg_temp.fails($$select public.poll_text_tally_apply('22222222-0000-0000-0000-000000000001', '{}')$$, 'invalid_payload', 'tally tekstowy: zły payload');

-- zaproszenia na tekst, żeby sprawdzić wygaszenie po tally
insert into public.poll_tasks(owner_id, recipient_email, game_id, poll_type, share_key_poll, token)
 values ('aaaaaaaa-0000-0000-0000-00000000a315', 'inv2@test.pl', '22222222-0000-0000-0000-000000000001', 'poll_text',
         pg_temp.key('22222222-0000-0000-0000-000000000001'), '5a5a5a5a-0000-0000-0000-000000000002'),
        ('aaaaaaaa-0000-0000-0000-00000000a315', 'inv3@test.pl', '22222222-0000-0000-0000-000000000001', 'poll_text',
         pg_temp.key('22222222-0000-0000-0000-000000000001'), '5a5a5a5a-0000-0000-0000-000000000003');
update public.poll_tasks set status = 'done', done_at = now() where token = '5a5a5a5a-0000-0000-0000-000000000003';
create temp table old_key_t(k text);
insert into old_key_t select pg_temp.key('22222222-0000-0000-0000-000000000001');

create temp table payload_ok as
select jsonb_build_object('items', jsonb_agg(jsonb_build_object('question_id', q.id, 'answers',
  case q.ord
    when 2 then '[{"text":"a","count":7},{"text":"b","count":7},{"text":"c","count":7}]'::jsonb
    when 3 then '[{"text":"Bardzo długa odpowiedź tekstowa","count":5},{"text":"b","count":3},{"text":"c","count":2}]'::jsonb
    else '[{"text":"kot","count":50},{"text":"pies","count":30},{"text":"ryba","count":15},{"text":"chomik","count":5}]'::jsonb end))) as p
from public.questions q where q.game_id = '22222222-0000-0000-0000-000000000001';
select pg_temp.chk((public.poll_text_tally_apply('22222222-0000-0000-0000-000000000001', (select p from payload_ok))->>'status') = 'ready', 'poll_text_tally_apply -> ready');
select pg_temp.chk(pg_temp.st('22222222-0000-0000-0000-000000000001') = 'ready', 'tekst: status = ready');
select pg_temp.chk((select array_agg(fixed_points order by a.ord) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '22222222-0000-0000-0000-000000000001' and q.ord = 1) = array[50,30,15,5], 'pytanie 1: 50/30/15/5');
select pg_temp.chk((select sum(fixed_points) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '22222222-0000-0000-0000-000000000001' and q.ord = 1) = 100, 'pytanie 1: suma 100');
select pg_temp.chk((select array_agg(fixed_points order by a.ord) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '22222222-0000-0000-0000-000000000001' and q.ord = 2) = array[34,33,32], 'pytanie 2: 34/33/32');
select pg_temp.chk((select a.text from public.answers a join public.questions q on q.id = a.question_id where q.game_id = '22222222-0000-0000-0000-000000000001' and q.ord = 3 and a.ord = 1) = 'Bardzo długa odpo', 'pytanie 3: tekst przycięty do 17');
select pg_temp.chk(not exists(select 1 from public.questions q left join public.answers a on a.question_id = q.id where q.game_id = '22222222-0000-0000-0000-000000000001' group by q.id having count(a.id) < 3 or count(a.id) > 6 or sum(a.fixed_points) > 100), 'każde pytanie: 3..6 odpowiedzi, suma <= 100');
select pg_temp.chk(not exists(select 1 from public.poll_tally_drafts where game_id = '22222222-0000-0000-0000-000000000001'), 'szkic skasowany po tally');
select pg_temp.chk(pg_temp.key('22222222-0000-0000-0000-000000000001') <> (select k from old_key_t), 'tekst: klucz zrotowany');
select pg_temp.chk(not exists(select 1 from public.poll_tasks where token = '5a5a5a5a-0000-0000-0000-000000000002')
  and exists(select 1 from public.poll_tasks where token = '5a5a5a5a-0000-0000-0000-000000000003'), 'czekające zaproszenie usunięte, wykonane zostaje jako historia');
select pg_temp.chk((public.poll_state('22222222-0000-0000-0000-000000000001', (select k from old_key_t))->>'state') = 'ended', 'tekst: stary link = ended');
select pg_temp.fails($$select pg_temp.vote_text('22222222-0000-0000-0000-000000000001', (select k from old_key_t), 'voter-t199', 'kot')$$, 'Invalid poll key', 'tekst: wpis starym kluczem po tally odrzucony');
select pg_temp.chk((public.game_validate('22222222-0000-0000-0000-000000000001')->'play'->>'ok')::boolean, 'tekst: po tally można grać');
select pg_temp.fails($$select public.poll_text_tally_apply('22222222-0000-0000-0000-000000000001', (select p from payload_ok))$$, 'poll_not_stopped', 'tally z ready odrzucony');

-- ============================================================
-- 5. Usuwanie
-- ============================================================
-- usunięcie gry z zatrzymaną ankietą jest dozwolone (jak z otwartą)
select public.poll_open('22222222-0000-0000-0000-000000000002', pg_temp.key('22222222-0000-0000-0000-000000000002'));
select public.poll_stop('22222222-0000-0000-0000-000000000002');
create temp table del_res as select public.delete_resource_checked('game', '22222222-0000-0000-0000-000000000002') as r;
select pg_temp.chk((select (r->>'ok')::boolean from del_res)
  and not exists(select 1 from public.games where id = '22222222-0000-0000-0000-000000000002'), 'delete_resource_checked: gra z zatrzymaną ankietą usunięta');

ROLLBACK;
select '315 OK' as wynik;
