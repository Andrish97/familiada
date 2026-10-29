-- Bezpieczeństwo (audyt E24, 2026-10-21): polityki Storage dodane ręcznie
-- (poza migracjami), bez warunku na bucket:
--  * storage.objects -- INSERT/UPDATE/DELETE dla authenticated z warunkiem
--    tylko na właściciela: każdy zalogowany (także gość) mógł wgrać plik do
--    DOWOLNEGO bucketu, w tym publicznego homepage-screenshots (hosting
--    obcych treści pod naszym adresem), z pominięciem ścieżek {uid}/...,
--  * storage.buckets -- ALL dla authenticated (właściciel): zalogowany mógł
--    zakładać własne buckety.
-- Aplikacja korzysta tylko z polityk per bucket (user-logos-*, user-sounds-*,
-- publiczny odczyt homepage-screenshots); reszta przez klucz serwisowy.
-- Zostają polityki z bucket_id, polityki service_role i odczyt listy bucketów.

DO $$
DECLARE
  pol record;
  n int := 0;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename IN ('objects', 'buckets')
      AND roles && array['authenticated']::name[]
      AND NOT (roles && array['service_role']::name[])
      AND cmd <> 'SELECT'
      AND coalesce(qual, '') || coalesce(with_check, '') !~ 'bucket_id'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.%I', pol.policyname, pol.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'storage_drop_generic_policies: usunięto % polityk', n;
END $$;
