-- E25: bez fikstur przypisanych do konkretnych kont (decyzja użytkownika
-- 2026-10-22: „usuń”, skrzynka uniwersalna). Stare wersje miały adresata na
-- stałe (test8, test14 -- konta usunięte w 463), wersje z 462 adresata w
-- parametrze. Uniwersalne zostają: sprzątanie par (friendships, poll
-- subscriptions, shared devices), budżety i cooldowny adresu, czyszczenie
-- przy wypożyczeniu (e2e_reset_identity).
DROP FUNCTION IF EXISTS public.e2e_registered_subscriber_fixture(boolean);
DROP FUNCTION IF EXISTS public.e2e_registered_subscriber_fixture(uuid, boolean);
DROP FUNCTION IF EXISTS public.e2e_subscriber_mail_flag(boolean);
DROP FUNCTION IF EXISTS public.e2e_subscriber_mail_flag(text, boolean);
