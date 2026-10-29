-- Migration: Remove unused tables from old architecture
-- The new architecture keeps state in Python memory, these tables are obsolete.

DROP TABLE IF EXISTS marketing_search_queries_log CASCADE;
DROP TABLE IF EXISTS marketing_search_urls CASCADE;
DROP TABLE IF EXISTS marketing_raw_contacts CASCADE;
DROP TABLE IF EXISTS marketing_search_runs CASCADE;

-- We keep marketing_search_logs (for live logs) and marketing_verified_contacts (for results)
