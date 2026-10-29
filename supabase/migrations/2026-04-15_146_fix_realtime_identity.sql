-- Migration: Fix realtime logs - set REPLICA IDENTITY
-- Fixes migration 145 which had syntax error

ALTER TABLE marketing_search_logs REPLICA IDENTITY FULL;

-- Ensure function exists
CREATE OR REPLACE FUNCTION clear_marketing_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM marketing_search_logs;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_marketing_logs() TO service_role;
