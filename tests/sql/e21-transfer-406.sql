-- Migracja 406 (E21): wspólny kontrakt transferu (te same przypadki co
-- tests/unit/gameTransferFormat.test.js). Lokalna baza wg docs/sql/local-db.md
-- (schema.sql + 404 + 405); z katalogu repo: psql ... -d fam -f tests/sql/e21-transfer-406.sql
\set ON_ERROR_STOP 1
\set owner '40600000-0000-4000-8000-0000000000aa'
begin;
\ir ../../supabase/migrations/2026-10-20_404_e21_rules_engine.sql
\ir ../../supabase/migrations/2026-10-20_406_e21_transfer.sql
insert into auth.users(id,email) values (:'owner','o406@x.pl');

do $$
declare n jsonb; r jsonb; g uuid; owner uuid := '40600000-0000-4000-8000-0000000000aa';
  ten jsonb := (select jsonb_agg(jsonb_build_object('text', 'P' || i, 'answers', '[{"text":"a","fixed_points":40},{"text":"b","fixed_points":30},{"text":"c","fixed_points":4}]'::jsonb)) from generate_series(1,10) i);
begin
  -- punkty
  if (select array_agg(public._transfer_points(v) order by o) from jsonb_array_elements('[-1,101,"abc",null,true,"40",12.7,0,100,"1e400"]') with ordinality t(v,o))
     <> array[0,0,0,0,0,40,12,0,100,0] then raise exception '_transfer_points'; end if;

  -- normalizacja: 80/100/17, >6 -> sześć najwyżej punktowanych, puste pominięte, znaki z czcionki
  n := public._game_package_normalize(jsonb_build_object('format_version', 2,
    'game', jsonb_build_object('name', repeat('N', 81), 'type', 'prepared', 'state', 'draft'),
    'questions', jsonb_build_array(
      jsonb_build_object('text', repeat('P', 101), 'answers', (select jsonb_agg(jsonb_build_object('text', rpad('odp ' || (i-1), 18, '.'), 'fixed_points', p) order by i)
        from unnest(array['10','101','30','-5','30','"x"','50','20']) with ordinality u(p, i) cross join lateral (select p::jsonb) j(pj))),
      jsonb_build_object('text', 'Krótkie', 'answers', '[{"text":"b","fixed_points":5},{"text":"a😀","fixed_points":50},{"text":"😀","fixed_points":9}]'::jsonb))));
  if char_length(n#>>'{game,name}') <> 80 or char_length(n#>>'{questions,0,text}') <> 100 then raise exception 'limity: %', n->'game'; end if;
  if (select string_agg(left(a->>'text', 5) || ':' || (a->>'fixed_points'), ',' order by i) from jsonb_array_elements(n#>'{questions,0,answers}') with ordinality t(a, i))
     <> 'odp 6:50,odp 2:30,odp 4:30,odp 7:20,odp 0:10,odp 1:0' then raise exception 'szóstka: %', n#>'{questions,0,answers}'; end if;
  if n#>'{questions,1,answers}' <> '[{"text":"b","fixed_points":5},{"text":"a","fixed_points":50}]' then raise exception 'puste/znaki: %', n#>'{questions,1,answers}'; end if;

  -- v1: niejasny typ -> preparowana szkic (recovered), points jako punkty
  n := public._game_package_normalize('{"game":{"name":"Stara","type":"fixed"},"questions":[{"text":"P","answers":[{"text":"a","points":30}]}]}');
  if n#>>'{game,type}' <> 'prepared' or not (n->>'recovered')::boolean or (n#>>'{questions,0,answers,0,fixed_points}')::int <> 30 then raise exception 'v1: %', n; end if;
  begin
    perform public._game_package_normalize('{"format_version":2,"game":{"type":"market"},"questions":[]}');
    raise exception 'market w pakiecie v2 przyjęty';
  exception when raise_exception then if sqlerrm <> 'invalid_game_package' then raise; end if; end;

  -- zamknięta ankieta: poprawna -> ready tego samego typu; niepoprawna -> szkic
  r := public._game_import_package(jsonb_build_object('format_version', 2, 'game', '{"name":"Z","type":"poll_text","state":"closed"}'::jsonb, 'questions', ten), owner, gen_random_uuid());
  select id into g from public.games where id = (r->>'id')::uuid and type = 'poll_text' and status = 'ready';
  if g is null or (select count(*) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = g) <> 30 then raise exception 'closed import: %', r; end if;
  r := public._game_import_package(jsonb_build_object('format_version', 2, 'game', '{"name":"Z","type":"poll_points","state":"closed"}'::jsonb, 'questions', ten), owner, gen_random_uuid());
  if r->>'state' <> 'closed' then raise exception 'closed points: %', r; end if;
  r := public._game_import_package(jsonb_build_object('format_version', 2, 'game', '{"name":"Z","type":"poll_points","state":"closed"}'::jsonb, 'questions', ten - 9), owner, gen_random_uuid());
  if r->>'state' <> 'draft' or not (r->>'closed_downgraded')::boolean
     or exists (select 1 from public.answers a join public.questions q on q.id = a.question_id where q.game_id = (r->>'id')::uuid and a.fixed_points <> 0)
  then raise exception 'downgrade: %', r; end if;
end $$;

-- Powiel otwartej ankiety -- dozwolony odczyt; Wyślij zamkniętej -- odmowa
do $$
declare g uuid; owner uuid := '40600000-0000-4000-8000-0000000000aa';
begin
  insert into public.games(owner_id,name,type,status) values (owner,'Otwarta','poll_text','draft') returning id into g;
  set local session_replication_role = replica;
  update public.games set status = 'poll_open' where id = g;
  set local session_replication_role = origin;
  if public._resource_clone_read(owner, 'game', g)#>>'{game,status}' <> 'poll_open' then raise exception 'read open'; end if;
  begin
    perform public._resource_clone_send_allowed('game', 'send', public._resource_clone_read(owner, 'game', g));
    raise exception 'wysyłka otwartej ankiety';
  exception when raise_exception then if sqlerrm <> 'not_sendable' then raise; end if; end;
  perform public._resource_clone_send_allowed('game', 'duplicate', public._resource_clone_read(owner, 'game', g));
  -- reguły akcji
  if not (public.game_rules_compute(g, 'poll_text', 'poll_open')->'duplicate'->>'drops_votes')::boolean then raise exception 'drops_votes'; end if;
  if public.game_rules_compute(g, 'poll_text', 'ready')->'send'->>'code' <> 'sendOnlyDraft' then raise exception 'send ready'; end if;
  if public.game_rules_compute(g, 'market', 'ready')->'export'->>'code' <> 'marketNoTransfer' then raise exception 'market export'; end if;
end $$;

-- Archiwalna kopia market: usunięcie pozycji Marketplace nie zmienia typu
do $$
declare mg uuid; g uuid; owner uuid := '40600000-0000-4000-8000-0000000000aa'; r record;
begin
  insert into public.market_games(author_user_id, title, lang, payload, status) values (owner, 'M', 'pl', '{"questions":[{"text":"P","answers":[{"text":"a😀","fixed_points":150},{"text":"b","fixed_points":20}]}]}', 'published') returning id into mg;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform public.market_add_to_library(mg);
  select id into g from public.games where source_market_id = mg;
  if (select string_agg(a.text || ':' || a.fixed_points, ',' order by a.ord) from public.answers a join public.questions q on q.id = a.question_id where q.game_id = g) <> 'a:0,b:20' then
    raise exception 'market_add_to_library normalizacja';
  end if;
  delete from public.market_games where id = mg;
  if (select type::text from public.games where id = g) <> 'market' then raise exception 'market -> prepared'; end if;
  select * into r from public.market_my_library() where game_id = g;
  if r is null or not r.archived or r.market_game_id is not null then raise exception 'archiwalna w bibliotece: %', r; end if;
end $$;
select 'e21-transfer-406: OK' as wynik;
rollback;
