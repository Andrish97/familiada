-- Test migracji 316 (model blokad: trzymanie wspólne / wyłączne) na lokalnej bazie
-- (docs/sql/local-db.md). Po schema.sql + migracjach 309–316:
--   psql -h /var/tmp/pgfam_e2 -p 5520 -U postgres -d fam -v ON_ERROR_STOP=1 -f docs/sql/test-locks-316.sql
-- Całość w jednej transakcji z ROLLBACK -- nic nie zostaje w bazie. Błąd asercji
-- przerywa skrypt (RAISE EXCEPTION); sukces kończy się napisem "316 OK".
BEGIN;

-- Użytkownik wołający: jak auth.uid() w Supabase.
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS
$$ select set_config('request.jwt.claim.sub', u::text, true) $$;

CREATE FUNCTION pg_temp.check(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS
$$ begin
  if cond is not true then raise exception 'BŁĄD: %', label; end if;
  raise notice 'ok   %', label;
end $$;

-- Skrót: acquire w trybie, zwraca "ok" albo kod błędu.
CREATE FUNCTION pg_temp.acq(typ text, id uuid, tab text, mode text DEFAULT 'exclusive') RETURNS text
LANGUAGE sql AS $$
  select case when (r->>'ok')::boolean then 'ok' else r->>'error' end
  from (select public.acquire_edit_lock_mode(typ, id, tab, null, mode) as r) x
$$;

-- Dane: właściciel U1, współpracownik U2 (edytor bazy), obcy U3.
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'u1@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'u3@example.test');
INSERT INTO public.profiles(id, email, username) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'u1@example.test', 'u1'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@example.test', 'u2'),
  ('00000000-0000-0000-0000-0000000000a3', 'u3@example.test', 'u3');
INSERT INTO public.question_bases(id, owner_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Baza');
INSERT INTO public.question_base_shares(base_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'editor');
INSERT INTO public.qb_categories(id, base_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Folder');
INSERT INTO public.user_logos(id, user_id, name, type) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'L1', 'GLYPH_30x10'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'L2', 'GLYPH_30x10');
INSERT INTO public.games(id, owner_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Gra');

DO $$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u3 uuid := '00000000-0000-0000-0000-0000000000a3';
  b  uuid := '00000000-0000-0000-0000-0000000000b1';
  f  uuid := '00000000-0000-0000-0000-0000000000c1';
  l1 uuid := '00000000-0000-0000-0000-0000000000d1';
  l2 uuid := '00000000-0000-0000-0000-0000000000d2';
  g  uuid := '00000000-0000-0000-0000-0000000000e1';
  r jsonb;
begin
  -- 1. base:B współdzielone przez dwie karty (właściciel + współpracownik, i druga karta właściciela)
  perform pg_temp.as_user(u1);
  perform pg_temp.check('base:B shared, karta A1', pg_temp.acq('base', b, 'A1', 'shared') = 'ok');
  perform pg_temp.check('base:B shared, druga karta tego samego użytkownika', pg_temp.acq('base', b, 'A2', 'shared') = 'ok');
  perform pg_temp.as_user(u2);
  perform pg_temp.check('base:B shared, współpracownik', pg_temp.acq('base', b, 'B1', 'shared') = 'ok');
  perform pg_temp.check('wiersze shared base:B = 3',
    (select count(*) from public.edit_locks where resource_type='base' and resource_id=b and mode='shared') = 3);
  perform pg_temp.as_user(u3);
  perform pg_temp.check('base:B shared, obcy: forbidden', pg_temp.acq('base', b, 'C1', 'shared') = 'forbidden');

  -- 2. wyłączne base:B blokowane przez shared (i odwrotnie)
  perform pg_temp.as_user(u1);
  perform pg_temp.check('base:B exclusive blokowane przez shared', pg_temp.acq('base', b, 'A3', 'exclusive') = 'locked');
  r := public.delete_resource_checked('base', b, 'A3');
  perform pg_temp.check('delete base przy otwartym eksploratorze: in_use', (r->>'in_use')::boolean);
  r := public.rename_resource_checked('base', b, 'Nowa', 'A3');
  perform pg_temp.check('rename base przy otwartym eksploratorze: in_use', (r->>'in_use')::boolean);
  -- elementy bazy nie są blokowane przez shared base:B
  perform pg_temp.as_user(u2);
  perform pg_temp.check('base_folder exclusive mimo shared base:B', pg_temp.acq('base_folder', f, 'B1') = 'ok');
  perform pg_temp.as_user(u1);
  perform pg_temp.check('base_folder drugi exclusive: locked', pg_temp.acq('base_folder', f, 'A1') = 'locked');
  delete from public.edit_locks where resource_type = 'base_folder';

  -- po zwolnieniu wszystkich shared: wyłączne przechodzi, a shared jest wtedy blokowane
  delete from public.edit_locks where resource_type = 'base';
  perform pg_temp.check('base:B exclusive po zwolnieniu', pg_temp.acq('base', b, 'A3', 'exclusive') = 'ok');
  perform pg_temp.as_user(u2);
  perform pg_temp.check('base:B shared blokowane przez exclusive', pg_temp.acq('base', b, 'B1', 'shared') = 'locked');
  perform pg_temp.as_user(u1);
  r := public.rename_resource_checked('base', b, 'Nowa nazwa', 'A3');
  perform pg_temp.check('rename base z własną kartą (trzyma exclusive): ok', (r->>'ok')::boolean);
  perform pg_temp.check('nazwa zmieniona', (select name from public.question_bases where id = b) = 'Nowa nazwa');
  r := public.rename_resource_checked('base', b, 'Inna', 'A9');
  perform pg_temp.check('rename base z obcej karty: in_use', (r->>'in_use')::boolean);
  delete from public.edit_locks where resource_type = 'base';

  -- 3. logos shared x2 OK
  perform pg_temp.check('logos shared, karta G1 (Control)', pg_temp.acq('logos', u1, 'G1', 'shared') = 'ok');
  perform pg_temp.check('logos shared, karta G2 (ustawienia)', pg_temp.acq('logos', u1, 'G2', 'shared') = 'ok');
  perform pg_temp.check('logos exclusive blokowane przez shared', pg_temp.acq('logos', u1, 'G3', 'exclusive') = 'locked');

  -- 4. logo:L exclusive blokowane przy trzymanym logos
  perform pg_temp.check('logo:L exclusive blokowane przy logos', pg_temp.acq('logo', l1, 'E1') = 'locked');
  r := public.update_logo_checked(l1, '{"name":"X"}'::jsonb, 'E1');
  perform pg_temp.check('update_logo_checked odmawia przy logos', (r->>'in_use')::boolean);
  r := public.rename_resource_checked('logo', l1, 'X', 'E1');
  perform pg_temp.check('rename logo odmawia przy logos', (r->>'in_use')::boolean);
  r := public.delete_resource_checked('logo', l1, 'E1');
  perform pg_temp.check('delete logo odmawia przy logos', (r->>'in_use')::boolean);
  perform pg_temp.check('logo nadal istnieje', exists (select 1 from public.user_logos where id = l1));

  -- ... i odwrotnie
  delete from public.edit_locks where resource_type = 'logos';
  perform pg_temp.check('logo:L exclusive po zwolnieniu logos', pg_temp.acq('logo', l1, 'E1') = 'ok');
  perform pg_temp.check('logos shared blokowane przy logo:L (inne logo L2 też)', pg_temp.acq('logos', u1, 'G1', 'shared') = 'locked');
  perform pg_temp.check('inne logo L2 exclusive niezależne', pg_temp.acq('logo', l2, 'E2') = 'ok');
  perform pg_temp.check('to samo logo z drugiej karty: locked', pg_temp.acq('logo', l1, 'E3') = 'locked');
  r := public.update_logo_checked(l1, '{"name":"Zapis"}'::jsonb, 'E1');
  perform pg_temp.check('zapis logo własną kartą (trzyma exclusive): ok', (r->>'ok')::boolean);
  -- zgodność wstecz: wywołanie bez karty (stara wersja strony) nie zderza się z własną blokadą
  r := public.update_logo_checked(l1, '{"name":"Bez karty"}'::jsonb, null);
  perform pg_temp.check('zapis logo bez karty przez trzymającego użytkownika: ok', (r->>'ok')::boolean);
  r := public.update_logo_checked(l1, '{"name":"Obca"}'::jsonb, 'E9');
  perform pg_temp.check('zapis logo cudzą kartą: in_use', (r->>'in_use')::boolean);
  r := public.delete_resource_checked('logo', l2, 'E9');
  perform pg_temp.check('delete logo L2 trzymanego przez E2: in_use', (r->>'in_use')::boolean);
  delete from public.edit_locks where resource_type in ('logo', 'logos');

  -- 5. game: rename / delete przy trzymanej grze
  perform pg_temp.check('game:G exclusive', pg_temp.acq('game', g, 'P1') = 'ok');
  perform pg_temp.check('game:G drugi exclusive: locked', pg_temp.acq('game', g, 'P2') = 'locked');
  r := public.rename_resource_checked('game', g, 'Inna', 'P2');
  perform pg_temp.check('rename game przy trzymanej: in_use', (r->>'in_use')::boolean);
  r := public.rename_resource_checked('game', g, 'Inna', 'P1');
  perform pg_temp.check('rename game własną kartą: ok', (r->>'ok')::boolean);
  r := public.delete_resource_checked('game', g, 'P2');
  perform pg_temp.check('delete game przy trzymanej: in_use', (r->>'in_use')::boolean);
  -- stary delete_resource_checked(typ, id) (2 argumenty, bez karty) odmawia przy blokadzie
  -- innego użytkownika (tu: wiersz przepisany na U2) ...
  update public.edit_locks set holder_user_id = u2 where resource_type = 'game';
  r := public.delete_resource_checked('game', g);
  perform pg_temp.check('delete_resource_checked 2 argumenty, cudza blokada: in_use', (r->>'in_use')::boolean);
  update public.edit_locks set holder_user_id = u1 where resource_type = 'game';
  delete from public.edit_locks where resource_type = 'game';

  -- 6. stara acquire_edit_lock(typ, id, tab, kontekst) działa jak wyłączne
  r := public.acquire_edit_lock('game', g, 'OLD1', 'editor');
  perform pg_temp.check('stara acquire_edit_lock: ok', (r->>'ok')::boolean);
  perform pg_temp.check('stara acquire_edit_lock zapisuje mode=exclusive',
    (select mode from public.edit_locks where resource_type='game' and resource_id=g) = 'exclusive');
  r := public.acquire_edit_lock('game', g, 'OLD2', 'settings');
  perform pg_temp.check('stara acquire_edit_lock: druga karta locked', r->>'error' = 'locked');
  r := public.acquire_edit_lock('game', g, 'OLD1', 'editor');
  perform pg_temp.check('odnowienie tą samą kartą: ok', (r->>'ok')::boolean);

  -- 7. TTL: 120 s
  perform pg_temp.check('edit_lock_ttl = 120 s', public.edit_lock_ttl() = interval '120 seconds');
  update public.edit_locks set heartbeat_at = now() - interval '100 seconds' where resource_type='game';
  perform pg_temp.check('po 100 s blokada trwa', pg_temp.acq('game', g, 'OLD2') = 'locked');
  update public.edit_locks set heartbeat_at = now() - interval '130 seconds' where resource_type='game';
  perform pg_temp.check('po 130 s blokada wygasła, przejęcie ok', pg_temp.acq('game', g, 'OLD2') = 'ok');
  perform pg_temp.check('został jeden wiersz game:G',
    (select count(*) from public.edit_locks where resource_type='game' and resource_id=g) = 1);
  -- wygasłe shared nie przeszkadza w exclusive
  perform pg_temp.check('logos shared', pg_temp.acq('logos', u1, 'G1', 'shared') = 'ok');
  update public.edit_locks set heartbeat_at = now() - interval '130 seconds' where resource_type='logos';
  perform pg_temp.check('wygasłe logos nie blokuje logo:L', pg_temp.acq('logo', l1, 'E1') = 'ok');
  -- stara tablica: wygasły wiersz wyłączny cudzej karty w rename_resource_checked nie blokuje
  update public.edit_locks set heartbeat_at = now() - interval '130 seconds' where resource_type='logo';
  r := public.rename_resource_checked('logo', l1, 'Po TTL', 'E9');
  perform pg_temp.check('rename logo po wygaśnięciu blokady: ok', (r->>'ok')::boolean);

  -- 8. walidacja
  perform pg_temp.check('nieznany tryb', pg_temp.acq('game', g, 'X', 'foo') = 'unknown_mode');
  perform pg_temp.check('logos cudzego użytkownika: gone', pg_temp.acq('logos', u2, 'X', 'shared') = 'gone');
  perform pg_temp.check('nieistniejąca gra: gone', pg_temp.acq('game', gen_random_uuid(), 'X') = 'gone');
end $$;

-- 9. RLS: właściciel widzi własne wiersze logos; obcy nie
DELETE FROM public.edit_locks;
INSERT INTO public.edit_locks(resource_type, resource_id, holder_tab_id, holder_user_id, mode)
VALUES ('logos', '00000000-0000-0000-0000-0000000000a1', 'RLS1', '00000000-0000-0000-0000-0000000000a1', 'shared');
GRANT SELECT ON public.edit_locks TO authenticated;  -- stuby lokalne nie nadają uprawnień Supabase
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
DO $$ begin
  perform pg_temp.check('RLS: właściciel widzi logos', (select count(*) from public.edit_locks where resource_type='logos') = 1);
end $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
DO $$ begin
  perform pg_temp.check('RLS: obcy nie widzi logos', (select count(*) from public.edit_locks where resource_type='logos') = 0);
end $$;
RESET ROLE;

SELECT '316 OK' AS wynik;
ROLLBACK;
