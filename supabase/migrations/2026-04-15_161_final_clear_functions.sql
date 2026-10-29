-- SUPERSEDES: 2026-04-15_158_clear_tables_rpc.sql
-- SUPERSEDES: 2026-04-15_159_fix_clear_functions.sql
-- SUPERSEDES: 2026-04-15_160_fix_clear_truncate.sql

-- Migration: Final fix - clear functions using DELETE inside plpgsql function

CREATE OR REPLACE FUNCTION public.clear_marketing_search_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM marketing_search_logs;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_marketing_queries_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM marketing_search_queries_log;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_marketing_search_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_marketing_search_logs() TO anon;
GRANT EXECUTE ON FUNCTION public.clear_marketing_queries_log() TO service_role;
