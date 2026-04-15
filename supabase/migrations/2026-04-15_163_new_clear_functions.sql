-- New clean functions for clearing marketing tables

CREATE OR REPLACE FUNCTION public.truncate_marketing_search_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    TRUNCATE marketing_search_logs RESTART IDENTITY CASCADE;
END;
$$;

CREATE OR REPLACE FUNCTION public.truncate_marketing_queries_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    TRUNCATE marketing_search_queries_log RESTART IDENTITY CASCADE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.truncate_marketing_search_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.truncate_marketing_queries_log() TO service_role;
