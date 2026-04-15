-- Migration: Fix realtime for marketing_search_logs and add log cleanup
-- This supersedes migration 144 which only partially enabled realtime

-- 1. Enable replica identity for realtime (needed for INSERT tracking)
ALTER TABLE marketing_search_logs REPLICA IDENTITY FULL;

-- 2. Add table to realtime publication (use separate statements)
ALTER PUBLICATION supabase_realtime ADD TABLE marketing_search_logs;

-- 3. Create function to clear old logs (more reliable than truncate via REST API)
CREATE OR REPLACE FUNCTION clear_marketing_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM marketing_search_logs;
END;
$$;

-- 4. Grant execute to service role
GRANT EXECUTE ON FUNCTION clear_marketing_logs() TO service_role;
