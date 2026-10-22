-- Migracja 441: zmiana typu gry z zamkniętą ankietą z opcjonalnym zachowaniem
-- wyników (p_keep). Uruchomienie: lokalna baza wg docs/sql/local-db.md
-- (schema.sql + migracja 441), potem: psql ... -d fam -f tests/sql/change-type-keep-441.sql
\set ON_ERROR_STOP 1
\set owner '44100000-0000-4000-8000-0000000000aa'
begin;
insert into auth.users(id,email) values (:'owner','o441@x.pl');
select set_config('request.jwt.claim.sub',:'owner',true);

-- Zamknięta ankieta: 10 pytań po 3 odpowiedzi z punktami z podliczenia 40/30/20.
create function pg_temp.mk(p_type text) returns uuid language plpgsql as $$
declare g uuid := gen_random_uuid(); q uuid; i int; a int;
begin
  insert into public.games(id,owner_id,name,type,status) values (g, '44100000-0000-4000-8000-0000000000aa', 'G441-' || p_type, p_type::public.game_type, 'draft');
  for i in 1..10 loop
    insert into public.questions(game_id,ord,text) values (g, i, 'Pytanie ' || i) returning id into q;
    for a in 1..3 loop
      insert into public.answers(question_id,ord,text,fixed_points) values (q, a, 'Odp ' || a, case a when 1 then 40 when 2 then 30 else 20 end);
    end loop;
  end loop;
  update public.games set status = 'ready', poll_closed_at = now() where id = g;
  return g;
end $$;
create function pg_temp.pts(g uuid) returns int language sql as $$
  select coalesce(sum(a.fixed_points),0)::int from public.answers a join public.questions q on q.id = a.question_id where q.game_id = g $$;
create function pg_temp.ans(g uuid) returns int language sql as $$
  select count(*)::int from public.answers a join public.questions q on q.id = a.question_id where q.game_id = g $$;
create function pg_temp.st(g uuid) returns text language sql as $$
  select type::text || '/' || status::text from public.games where id = g $$;

do $$
declare g uuid; r jsonb;
begin
  -- bez zgody na usunięcie głosów: odmowa jak dotąd
  g := pg_temp.mk('poll_points');
  r := public.game_change_type(g, 'prepared');
  if r->>'error' <> 'needs_reset' then raise exception 'needs_reset: %', r; end if;

  -- punktacja -> preparowana, zachowaj punkty
  r := public.game_change_type(g, 'prepared', true, true);
  if not (r->>'ok')::boolean or not (r->>'kept')::boolean then raise exception 'pp->prep keep: %', r; end if;
  if pg_temp.st(g) <> 'prepared/draft' or pg_temp.pts(g) <> 900 or pg_temp.ans(g) <> 30 then
    raise exception 'pp->prep keep dane: % % %', pg_temp.st(g), pg_temp.pts(g), pg_temp.ans(g); end if;
  if not ((select rules_state from public.games where id = g)->'play'->>'ok')::boolean then raise exception 'pp->prep keep: gra niegotowa'; end if;

  -- punktacja -> preparowana bez zachowania: punkty wyzerowane, odpowiedzi zostają
  g := pg_temp.mk('poll_points');
  r := public.game_change_type(g, 'prepared', true, false);
  if pg_temp.st(g) <> 'prepared/draft' or pg_temp.pts(g) <> 0 or pg_temp.ans(g) <> 30 then
    raise exception 'pp->prep bez: % % %', pg_temp.st(g), pg_temp.pts(g), pg_temp.ans(g); end if;

  -- zgodność wstecz: stare wywołanie (3 argumenty) = reset z zerowaniem punktów
  g := pg_temp.mk('poll_points');
  r := public.game_change_type(g, 'prepared', true);
  if pg_temp.pts(g) <> 0 or pg_temp.ans(g) <> 30 then raise exception 'stare wywołanie: %', r; end if;

  -- tekstowa -> preparowana, zachowaj odpowiedzi i punkty
  g := pg_temp.mk('poll_text');
  r := public.game_change_type(g, 'prepared', true, true);
  if pg_temp.st(g) <> 'prepared/draft' or pg_temp.pts(g) <> 900 or pg_temp.ans(g) <> 30 then
    raise exception 'pt->prep keep: % % %', pg_temp.st(g), pg_temp.pts(g), pg_temp.ans(g); end if;

  -- tekstowa -> preparowana bez zachowania: same pytania
  g := pg_temp.mk('poll_text');
  r := public.game_change_type(g, 'prepared', true, false);
  if pg_temp.st(g) <> 'prepared/draft' or pg_temp.ans(g) <> 0 then raise exception 'pt->prep bez: % %', pg_temp.st(g), pg_temp.ans(g); end if;

  -- tekstowa -> punktacja, zachowaj odpowiedzi (punkty da nowa ankieta)
  g := pg_temp.mk('poll_text');
  r := public.game_change_type(g, 'poll_points', true, true);
  if pg_temp.st(g) <> 'poll_points/draft' or pg_temp.ans(g) <> 30 or pg_temp.pts(g) <> 0 then
    raise exception 'pt->pp keep: % % %', pg_temp.st(g), pg_temp.ans(g), pg_temp.pts(g); end if;

  -- tekstowa -> punktacja bez zachowania: same pytania
  g := pg_temp.mk('poll_text');
  r := public.game_change_type(g, 'poll_points', true, false);
  if pg_temp.st(g) <> 'poll_points/draft' or pg_temp.ans(g) <> 0 then raise exception 'pt->pp bez: % %', pg_temp.st(g), pg_temp.ans(g); end if;

  -- punktacja -> tekstowa: same pytania, p_keep bez znaczenia
  g := pg_temp.mk('poll_points');
  r := public.game_change_type(g, 'poll_text', true, true);
  if pg_temp.st(g) <> 'poll_text/draft' or pg_temp.ans(g) <> 0 or (r->>'kept')::boolean then
    raise exception 'pp->pt: % % %', pg_temp.st(g), pg_temp.ans(g), r; end if;

  -- szkic (bez ankiety): p_keep ignorowane, jak dotąd
  g := pg_temp.mk('poll_points');
  update public.games set status = 'draft' where id = g;
  r := public.game_change_type(g, 'prepared', false, true);
  if pg_temp.st(g) <> 'prepared/draft' or pg_temp.pts(g) <> 900 then raise exception 'szkic: % %', pg_temp.st(g), pg_temp.pts(g); end if;
  raise notice 'change-type-keep-441: OK';
end $$;
rollback;
