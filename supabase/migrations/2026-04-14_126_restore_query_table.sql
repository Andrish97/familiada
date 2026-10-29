-- Migration: Restore query history table to prevent duplicate searches
-- This allows the script to remember what it has already searched for across restarts.

CREATE TABLE IF NOT EXISTS marketing_search_queries_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    query_text text NOT NULL UNIQUE,
    urls_found integer DEFAULT 0,
    status text DEFAULT 'completed',
    created_at timestamptz DEFAULT now()
);

-- Add RLS policies
ALTER TABLE marketing_search_queries_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_queries_log_all" ON marketing_search_queries_log;
CREATE POLICY "marketing_queries_log_all" ON marketing_search_queries_log FOR ALL USING (true) WITH CHECK (true);
