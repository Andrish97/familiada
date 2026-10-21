-- Migracje 452–454 (audyt E24, paczka P1). Lokalna baza wg docs/sql/local-db.md
-- (schema.sql + stuby), potem migracje 452, 453, 454 i ten plik.
-- Stan „przed” (polityka publicznego SELECT na user-logos) przygotowuje
-- tests/sql/security-p1-before.sql.
\set ON_ERROR_STOP 1

-- 452: nagłówek X-Internal-Secret = hex(HMAC-SHA256(mail_worker_secret, 'storage-cleanup')).
do $$ declare src text; begin
  select prosrc into src from pg_proc where oid = 'public.storage_cleanup_kick()'::regprocedure;
  if src !~ 'X-Internal-Secret' or src !~ 'mail_worker_secret' then raise exception '452: brak nagłówka'; end if;
  if has_function_privilege('anon', 'public.storage_cleanup_kick()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.storage_cleanup_kick()', 'EXECUTE') then
    raise exception '452: kick wykonywalny dla klienta';
  end if;
  -- Wektor zgodny z funkcją Edge (tests/unit/storageCleanupSecret.test.js).
  if encode(extensions.hmac('storage-cleanup', 'test-secret', 'sha256'), 'hex')
     <> '7d142014d30bcd1ef18534140dbd10c5bc144f64759a48205691ac44400f68a8' then
    raise exception '452: wektor HMAC';
  end if;
  raise notice '452: OK';
end $$;

-- Bez mail_worker_secret kick nie woła funkcji (ostrzeżenie, bez błędu).
select public.storage_cleanup_kick();

-- 453: SELECT na user-logos tylko właściciel folderu.
do $$ begin
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='user-logos-select') then
    raise exception '453: stara polityka publiczna została';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='user-logos-select-own' and cmd='SELECT' and roles = array['authenticated']::name[]) then
    raise exception '453: brak polityki właściciela';
  end if;
  if not (select public from storage.buckets where id='user-logos') then raise exception '453: bucket nie jest publiczny'; end if;
end $$;

begin;
insert into storage.objects(bucket_id, name) values
  ('user-logos', '11111111-1111-1111-1111-111111111111/a.png'),
  ('user-logos', '22222222-2222-2222-2222-222222222222/b.png'),
  ('user-sounds', '11111111-1111-1111-1111-111111111111/x.mp3');
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select on storage.objects to anon, authenticated;
set local role anon;
do $$ begin
  if (select count(*) from storage.objects where bucket_id='user-logos') <> 0 then raise exception '453: anon widzi listę'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  if (select count(*) from storage.objects where bucket_id='user-logos') <> 1 then raise exception '453: właściciel nie widzi tylko swoich'; end if;
end $$;
reset role;
rollback;
select '453: OK' as wynik;

-- 454: tabele usunięte.
do $$ begin
  if to_regclass('public.example_table') is not null or to_regclass('public.konta_do_stworzenia') is not null then
    raise exception '454: tabele zostały';
  end if;
  raise notice '454: OK';
end $$;
