-- Migration: Add urls_added to search query logs
ALTER TABLE IF EXISTS "public"."marketing_search_queries_log" 
ADD COLUMN IF NOT EXISTS "urls_added" integer DEFAULT 0;

-- Upewnijmy się też, że urls_found istnieje (jeśli wcześniej nie dodało)
ALTER TABLE IF EXISTS "public"."marketing_search_queries_log" 
ADD COLUMN IF NOT EXISTS "urls_found" integer DEFAULT 0;
