-- Test migracji 313 (kolejka sprzątania Storage) na lokalnej bazie
-- (docs/sql/local-db.md). Po schema.sql + 313:
--   psql ... -v ON_ERROR_STOP=1 -f docs/sql/test-storage-313.sql
-- W transakcji z ROLLBACK; sukces kończy się napisem "313 OK".
BEGIN;
CREATE FUNCTION pg_temp.check(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS
$$ begin
  if cond is not true then raise exception 'BŁĄD: %', label; end if;
  raise notice 'ok   %', label;
end $$;

INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'u1@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@example.test');
INSERT INTO public.profiles(id, email, username) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'u1@example.test', 'u1'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@example.test', 'u2');
INSERT INTO public.games(id, owner_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'G1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'G2');
INSERT INTO public.user_logos(id, user_id, name, type, payload) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'L1', 'PIX_150x70',
   '{"source":{"imageUrl":"https://x/storage/v1/object/public/user-logos/00000000-0000-0000-0000-0000000000a1/img1.png?t=1"}}'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'L2', 'PIX_150x70',
   '{"source":{"imageUrl":"https://x/storage/v1/object/public/user-logos/OBCY/img.png"}}'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', 'L3', 'GLYPH_30x10', '{}');

DO $$
declare r record; n int;
begin
  -- gra → folder dźwięków
  delete from public.games where id = '00000000-0000-0000-0000-0000000000e1';
  perform pg_temp.check('gra: folder user-sounds w kolejce',
    exists (select 1 from public.storage_cleanup_queue where bucket='user-sounds' and is_folder
            and path = '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000e1'));
  -- logo z obrazem we własnym folderze → plik; obcy folder / brak obrazu → nic
  delete from public.user_logos where user_id = '00000000-0000-0000-0000-0000000000a1';
  perform pg_temp.check('logo: plik user-logos w kolejce (bez ?t=)',
    exists (select 1 from public.storage_cleanup_queue where bucket='user-logos' and not is_folder
            and path = '00000000-0000-0000-0000-0000000000a1/img1.png'));
  perform pg_temp.check('logo: obcy folder i brak obrazu pominięte',
    (select count(*) from public.storage_cleanup_queue where bucket='user-logos') = 1);
  -- przywrócenie z tym samym obrazem (jak demo): wpis zniknie bez kasowania
  insert into public.user_logos(user_id, name, type, payload) values
    ('00000000-0000-0000-0000-0000000000a1', 'L1b', 'PIX_150x70',
     '{"source":{"imageUrl":"https://x/storage/v1/object/public/user-logos/00000000-0000-0000-0000-0000000000a1/img1.png"}}');
  select count(*) into n from public.storage_cleanup_claim(100) c where c.bucket = 'user-logos';
  perform pg_temp.check('claim: obraz nadal używany — nie do usunięcia', n = 0);
  perform pg_temp.check('claim: wpis obrazu usunięty z kolejki',
    not exists (select 1 from public.storage_cleanup_queue where bucket='user-logos'));
  perform pg_temp.check('claim: folder gry wzięty (attempts=1)',
    (select attempts from public.storage_cleanup_queue where bucket='user-sounds') = 1);
  perform pg_temp.check('claim drugi raz w 5 min: nic', (select count(*) from public.storage_cleanup_claim(100)) = 0);
  -- wynik
  perform public.storage_cleanup_done(array(select id from public.storage_cleanup_queue), '[]');
  perform pg_temp.check('done: kolejka pusta', not exists (select 1 from public.storage_cleanup_queue));
  -- konto: foldery użytkownika w obu bucketach + gry
  delete from public.games where owner_id = '00000000-0000-0000-0000-0000000000a2';
  delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a2';
  perform pg_temp.check('konto: folder w obu bucketach',
    (select count(*) from public.storage_cleanup_queue where owner_kind='user' and path='00000000-0000-0000-0000-0000000000a2') = 2);
  -- błąd: wraca po 5 min
  update public.storage_cleanup_queue set claimed_at = null;
  select count(*) into n from public.storage_cleanup_claim(100);
  perform pg_temp.check('claim konta: 3 wpisy', n = 3);
  perform public.storage_cleanup_done('{}', (select jsonb_agg(jsonb_build_object('id', id, 'error', 'x')) from public.storage_cleanup_queue));
  perform pg_temp.check('failed: błąd zapisany, wpis zostaje',
    (select count(*) from public.storage_cleanup_queue where last_error = 'x') = 3);
  -- usunięcie wycofane (savepoint) nie zostawia wpisu
  begin
    delete from public.user_logos;
    raise exception 'rollback';
  exception when others then null;
  end;
  perform pg_temp.check('wycofane usunięcie: brak nowego wpisu', (select count(*) from public.storage_cleanup_queue) = 3);
end $$;

SELECT has_function_privilege('authenticated', 'public.storage_cleanup_claim(integer)', 'execute') AS auth_can_claim;
SELECT '313 OK' AS wynik;
ROLLBACK;
