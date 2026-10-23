-- Migracja 479: blokady atomowo (tryb per zasób w jednym wywołaniu), blocker_id,
-- wygaszanie blokad kart nieobecnych na Presence, release tylko własnych.
-- Lokalna baza wg docs/sql/local-db.md — NAJPIERW zastosować migrację 479, potem:
--   psql ... -v ON_ERROR_STOP=1 -f tests/sql/edit-locks-realtime-479.sql
-- Całość w jednej transakcji z ROLLBACK; sukces kończy napis "edit-locks-realtime-479 OK".
\set ON_ERROR_STOP 1
begin;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-0000000479a1', 'owner479@example.test'),
  ('00000000-0000-4000-8000-0000000479a2', 'other479@example.test');
insert into public.profiles(id, username, email) values
  ('00000000-0000-4000-8000-0000000479a1', 'owner479', 'owner479@example.test'),
  ('00000000-0000-4000-8000-0000000479a2', 'other479', 'other479@example.test')
  on conflict (id) do nothing;
insert into public.user_logos(id, user_id, name, type) values
  ('00000000-0000-4000-8000-0000000479d1', '00000000-0000-4000-8000-0000000479a1', 'L1', 'GLYPH_30x10'),
  ('00000000-0000-4000-8000-0000000479d2', '00000000-0000-4000-8000-0000000479a1', 'L2', 'GLYPH_30x10');
insert into public.games(id, owner_id, name) values
  ('00000000-0000-4000-8000-0000000479e1', '00000000-0000-4000-8000-0000000479a1', 'Gra479');
insert into public.question_bases(id, owner_id, name) values
  ('00000000-0000-4000-8000-0000000479b1', '00000000-0000-4000-8000-0000000479a1', 'B479');

create function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u::text, true) $$;

create function pg_temp.check(label text, cond boolean) returns void language plpgsql as
$$ begin
  if cond is not true then raise exception 'BŁĄD: %', label; end if;
  raise notice 'ok   %', label;
end $$;

create function pg_temp.res(typ text, id uuid, mode text default null) returns jsonb language sql as
$$ select jsonb_strip_nulls(jsonb_build_object('type', typ, 'id', id, 'mode', mode)) $$;

-- Postarzenie heartbeatu karty (jak karta, która przestała odnawiać). SECURITY DEFINER,
-- bo RLS edit_locks pozwala roli authenticated tylko czytać.
create function pg_temp.age(tab text, secs int) returns void language sql security definer as
$$ update public.edit_locks set heartbeat_at = now() - make_interval(secs => secs) where holder_tab_id = tab $$;
-- Czy karta trzyma cokolwiek — bez RLS (inny użytkownik nie widzi cudzych wierszy).
create function pg_temp.held(tab text) returns boolean language sql security definer as
$$ select exists (select 1 from public.edit_locks where holder_tab_id = tab) $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000479a1');

do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000479a1';
  u2 uuid := '00000000-0000-4000-8000-0000000479a2';
  g uuid := '00000000-0000-4000-8000-0000000479e1';
  l1 uuid := '00000000-0000-4000-8000-0000000479d1';
  l2 uuid := '00000000-0000-4000-8000-0000000479d2';
  b uuid := '00000000-0000-4000-8000-0000000479b1';
  page jsonb;
  r jsonb;
begin
  -- Ustawienia gry / Control: game:G wyłącznie + logos współdzielone jednym wywołaniem.
  page := jsonb_build_array(pg_temp.res('game', g, 'exclusive'), pg_temp.res('logos', u1, 'shared'));
  r := public.acquire_edit_locks(page, 'tabA', 'settings');
  perform pg_temp.check('A: zestaw z trybami per zasób ok', (r->>'ok')::boolean and (r->>'count')::int = 2);
  perform pg_temp.check('A: game wyłącznie', exists (select 1 from public.edit_locks where resource_type = 'game' and resource_id = g and holder_tab_id = 'tabA' and mode = 'exclusive'));
  perform pg_temp.check('A: logos współdzielone', exists (select 1 from public.edit_locks where resource_type = 'logos' and resource_id = u1 and holder_tab_id = 'tabA' and mode = 'shared'));

  -- Druga karta tych samych ustawień: odmowa na game (pierwszy w kolejności), blocker_id = gra, nic nie zostaje.
  r := public.acquire_edit_locks(page, 'tabB', 'settings');
  perform pg_temp.check('B: locked', r->>'ok' = 'false' and r->>'error' = 'locked');
  perform pg_temp.check('B: resource = game', r->'resource'->>'type' = 'game' and (r->'resource'->>'id')::uuid = g and r->'resource'->>'mode' = 'exclusive');
  perform pg_temp.check('B: blocker_id = gra', r->>'blocker_type' = 'game' and (r->>'blocker_id')::uuid = g and r->>'blocker_context' = 'settings');
  perform pg_temp.check('B: nic nie trzyma', not exists (select 1 from public.edit_locks where holder_tab_id = 'tabB'));

  -- Edytor logo przy otwartych ustawieniach: blocker to pula logo (inny klucz niż logo:L).
  r := public.acquire_edit_lock_mode('logo', l1, 'tabC', 'logo-editor', 'exclusive');
  perform pg_temp.check('C: logo zablokowane przez logos', r->>'error' = 'locked' and r->>'blocker_type' = 'logos' and (r->>'blocker_id')::uuid = u1);

  -- A wychodzi (jedno wywołanie) -> C wchodzi; wtedy ustawienia (B) stoją na logos, blocker = logo:L1.
  r := public.release_edit_locks(page, 'tabA');
  perform pg_temp.check('A: zwolnione', not exists (select 1 from public.edit_locks where holder_tab_id = 'tabA'));
  r := public.acquire_edit_lock_mode('logo', l1, 'tabC', 'logo-editor', 'exclusive');
  perform pg_temp.check('C: logo zajęte', (r->>'ok')::boolean);
  r := public.acquire_edit_locks(page, 'tabB', 'settings');
  perform pg_temp.check('B: locked na logos przez logo:L1', r->>'error' = 'locked' and r->'resource'->>'type' = 'logos'
    and r->>'blocker_type' = 'logo' and (r->>'blocker_id')::uuid = l1);
  perform pg_temp.check('B: game nie zostało zajęte (wszystko albo nic)', not exists (select 1 from public.edit_locks where holder_tab_id = 'tabB'));

  -- Presence: C żywa (świeży heartbeat) -> nic nie znika, nawet gdy nie ma jej na kanale.
  r := public.expire_edit_locks_absent('logo', l1, '{}'::text[], 'tabB');
  perform pg_temp.check('expire: świeża blokada zostaje', (r->>'ok')::boolean and (r->>'removed')::int = 0);
  -- C od 30 s bez odnowienia, ale obecna na kanale -> zostaje.
  perform pg_temp.age('tabC', 30);
  r := public.expire_edit_locks_absent('logo', l1, array['tabC'], 'tabB');
  perform pg_temp.check('expire: obecna na Presence zostaje', (r->>'removed')::int = 0);
  -- C nieobecna i bez odnowienia -> znika, B wchodzi od razu (nie czeka na TTL 120 s).
  r := public.expire_edit_locks_absent('logo', l1, '{}'::text[], 'tabB');
  perform pg_temp.check('expire: martwa karta usunięta', (r->>'removed')::int = 1);
  r := public.acquire_edit_locks(page, 'tabB', 'settings');
  perform pg_temp.check('B: wchodzi po wygaszeniu martwej karty', (r->>'ok')::boolean and (r->>'count')::int = 2);

  -- expire nie rusza własnej karty wołającego ani kart z heartbeat w karencji.
  perform pg_temp.age('tabB', 30);
  r := public.expire_edit_locks_absent('game', g, '{}'::text[], 'tabB');
  perform pg_temp.check('expire: własna karta zostaje', (r->>'removed')::int = 0 and exists (select 1 from public.edit_locks where holder_tab_id = 'tabB' and resource_type = 'game'));
  perform pg_temp.age('tabB', 0);

  -- Częściowa odmowa zestawu: E bierze logo L2; F chce [base B wyłącznie, logos współdzielone]
  -- -> base wolne, logos zablokowane przez logo:L2 -> F nie trzyma nic (także base).
  r := public.acquire_edit_lock_mode('logo', l2, 'tabE', 'logo-editor', 'exclusive');
  perform pg_temp.check('E: logo L2 (B trzyma logos współdzielone — a logo wyklucza logos!)', r->>'error' = 'locked' and r->>'blocker_type' = 'logos');
  perform public.release_edit_locks(page, 'tabB');
  r := public.acquire_edit_lock_mode('logo', l2, 'tabE', 'logo-editor', 'exclusive');
  perform pg_temp.check('E: logo L2 zajęte po wyjściu B', (r->>'ok')::boolean);
  r := public.acquire_edit_locks(jsonb_build_array(pg_temp.res('base', b, 'exclusive'), pg_temp.res('logos', u1, 'shared')), 'tabF', 'test');
  perform pg_temp.check('F: odmowa na logos przez logo:L2', r->>'error' = 'locked' and r->'resource'->>'type' = 'logos' and (r->>'blocker_id')::uuid = l2);
  perform pg_temp.check('F: base nie zostało zajęte', not exists (select 1 from public.edit_locks where holder_tab_id = 'tabF'));

  -- Domyślny tryb p_mode, gdy element bez `mode` (zgodność z 431).
  r := public.acquire_edit_locks(jsonb_build_array(pg_temp.res('base', b)), 'tabD', 'base-explorer', 'shared');
  perform pg_temp.check('D: p_mode domyślny = shared', (r->>'ok')::boolean and exists (select 1 from public.edit_locks where holder_tab_id = 'tabD' and mode = 'shared'));

  -- release_edit_lock przez innego użytkownika nic nie zwalnia; expire bez prawa edycji -> forbidden.
  perform pg_temp.as_user(u2);
  r := public.release_edit_lock('base', b, 'tabD');
  perform pg_temp.check('U2: release cudzej blokady nic nie robi', pg_temp.held('tabD'));
  r := public.expire_edit_locks_absent('base', b, '{}'::text[], 'tabX');
  perform pg_temp.check('U2: expire bez prawa edycji = forbidden', r->>'error' = 'forbidden');
  perform pg_temp.as_user(u1);
  r := public.release_edit_lock('base', b, 'tabD');
  perform pg_temp.check('U1: release własnej blokady', not exists (select 1 from public.edit_locks where holder_tab_id = 'tabD'));
end $$;

select 'edit-locks-realtime-479 OK';
rollback;
