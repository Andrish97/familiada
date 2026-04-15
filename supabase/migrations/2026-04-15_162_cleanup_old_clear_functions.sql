-- Clean up old migrations for marketing tables

-- SUPERSES 158-161 (not clean approach)

DROP FUNCTION IF EXISTS public.clear_marketing_logs();
DROP FUNCTION IF EXISTS public.clear_marketing_queries_log();
DROP FUNCTION IF EXISTS public.clear_marketing_search_logs();
