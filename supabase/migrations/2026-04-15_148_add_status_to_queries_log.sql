-- Migration: Add status column to marketing_search_queries_log

ALTER TABLE marketing_search_queries_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
