-- 2026-04-22_190_clear_search_logs_for_new_format.sql
-- Wyczyszczenie tabeli logów wyszukiwania, aby uniknąć konfliktów z nowym formatem rola:miasto

TRUNCATE TABLE public.marketing_search_queries_log RESTART IDENTITY;
