-- Migration: Enable RLS for buffer tables
-- Ensuring marketing_raw_contacts and marketing_search_queries_log are protected

-- 1. Enable RLS
ALTER TABLE marketing_raw_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_search_queries_log ENABLE ROW LEVEL SECURITY;

-- 2. Create "Allow All" policies (consistent with other marketing tables in this project)
-- Note: In production, these should ideally be restricted to service_role or authenticated admin
DROP POLICY IF EXISTS "marketing_raw_all" ON marketing_raw_contacts;
CREATE POLICY "marketing_raw_all" ON marketing_raw_contacts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "marketing_queries_log_all" ON marketing_search_queries_log;
CREATE POLICY "marketing_queries_log_all" ON marketing_search_queries_log FOR ALL USING (true) WITH CHECK (true);
