-- Migration: Add score columns to verified contacts and fix search query log logic
ALTER TABLE IF EXISTS marketing_verified_contacts 
ADD COLUMN IF NOT EXISTS ai_score INTEGER,
ADD COLUMN IF NOT EXISTS seo_score INTEGER;

-- Ensure search queries log is clean for new logic
CREATE TABLE IF NOT EXISTS marketing_search_queries_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    query_text text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now()
);
