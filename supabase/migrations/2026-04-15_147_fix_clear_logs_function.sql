-- Migration: Fix clear_marketing_logs function for Supabase REST API
-- Supabase requires WHERE clause for DELETE

CREATE OR REPLACE FUNCTION clear_marketing_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM marketing_search_logs WHERE true;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_marketing_logs() TO service_role;
