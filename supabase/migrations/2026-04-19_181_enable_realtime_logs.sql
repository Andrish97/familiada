-- Migration: Enable Realtime for marketing logs
-- 1. Enable Realtime for the table
ALTER publication supabase_realtime ADD TABLE marketing_search_logs;

-- 2. Ensure RLS allows selecting logs (required for Realtime subscription)
-- If policy already exists, this is just for safety
DROP POLICY IF EXISTS "marketing_logs_read" ON marketing_search_logs;
CREATE POLICY "marketing_logs_read" ON marketing_search_logs FOR SELECT USING (true);
