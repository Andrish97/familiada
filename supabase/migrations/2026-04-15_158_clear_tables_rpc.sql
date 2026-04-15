-- Migration: Create functions to clear marketing tables (reliable truncate via RPC)

CREATE OR REPLACE FUNCTION clear_marketing_search_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM marketing_search_logs;
END;
$$;

CREATE OR REPLACE FUNCTION clear_marketing_queries_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM marketing_search_queries_log;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_marketing_search_logs() TO service_role;
GRANT EXECUTE ON FUNCTION clear_marketing_queries_log() TO service_role;
