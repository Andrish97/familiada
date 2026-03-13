-- 076: naprawa community-games - usuniecie blednych polityk
-- Naprawia migracje 072 ktora utworzyla polityki z is_admin (kolumna nie istnieje)

-- Usun polityki ktore zostaly utworzone z bledem
DROP POLICY IF EXISTS "community-games-admin-all" ON storage.objects;

-- Dodaj poprawna polityke dla admina (service_role omija RLS, wiec nie potrzeba)
-- Admin uzywa service_role_key wiec nie podlega pod RLS
