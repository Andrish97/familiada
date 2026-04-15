-- Migration: Create/fix clear functions for marketing tables

CREATE OR REPLACE FUNCTION public.clear_marketing_search_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    EXECUTE 'TRUNCATE TABLE marketing_search_logs CASCADE';
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_marketing_queries_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    EXECUTE 'TRUNCATE TABLE marketing_search_queries_log CASCADE';
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_marketing_search_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_marketing_queries_log() TO service_role;
