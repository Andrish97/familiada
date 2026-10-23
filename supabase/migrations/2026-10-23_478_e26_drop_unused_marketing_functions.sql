-- E26 (decyzja użytkownika 2026-10-23): nieużywane funkcje Lead Findera
-- i Marketplace — bez wywołującego w stronach, Workerze, funkcjach Edge,
-- Lead Finderze ani w innych funkcjach bazy (po 443/447 tylko service_role).
-- Zmiana schematu w czasie zamrożenia przeprowadzki — na prośbę właściciela;
-- zrzut przy przełączeniu musi być po 478 (przeprowadzka-serwera.md).
SET LOCAL lock_timeout = '3s';

DROP FUNCTION public.clear_marketing_search_logs();
DROP FUNCTION public.truncate_marketing_queries_log();
DROP FUNCTION public.truncate_marketing_search_logs();
DROP FUNCTION public.marketing_get_verified_contacts("uuid", integer, integer, boolean);
DROP FUNCTION public.market_admin_upsert("text", "text", "text", "jsonb");
