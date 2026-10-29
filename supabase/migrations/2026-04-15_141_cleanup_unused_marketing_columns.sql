-- Migration: Remove unused columns from marketing tables
-- Drops: marketing_search_urls, marketing_search_runs (never used by lead-finder)
-- Removes: unused columns from marketing_raw_contacts, marketing_verified_contacts, marketing_cities

-- ═══════════════════════════════════════════════════════════
-- 1. DROP unused tables
-- ═══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS marketing_search_urls;
DROP TABLE IF EXISTS marketing_search_runs;

-- ═══════════════════════════════════════════════════════════
-- 2. Clean marketing_raw_contacts - remove unused columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS run_id;
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS primary_email;
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS page_content_snippet;
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS processed_at;
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS created_at;
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS updated_at;

DROP INDEX IF EXISTS idx_marketing_raw_run;
DROP INDEX IF EXISTS idx_marketing_raw_email;

DROP TRIGGER IF EXISTS trg_marketing_raw_updated_at ON marketing_raw_contacts;

-- ═══════════════════════════════════════════════════════════
-- 3. Clean marketing_verified_contacts - remove unused columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS run_id;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS notes;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS updated_at;

DROP INDEX IF EXISTS idx_marketing_verified_run;
DROP INDEX IF EXISTS idx_marketing_verified_url;
DROP INDEX IF EXISTS idx_marketing_verified_email_array;

DROP TRIGGER IF EXISTS trg_marketing_verified_updated_at ON marketing_verified_contacts;

-- ═══════════════════════════════════════════════════════════
-- 4. Clean marketing_cities - remove unused columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE marketing_cities DROP COLUMN IF EXISTS search_count;
ALTER TABLE marketing_cities DROP COLUMN IF EXISTS last_searched;
ALTER TABLE marketing_cities DROP COLUMN IF EXISTS created_at;

-- ═══════════════════════════════════════════════════════════
-- 5. Clean marketing_search_logs - remove unused columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE marketing_search_logs DROP COLUMN IF EXISTS run_id;
ALTER TABLE marketing_search_logs DROP COLUMN IF EXISTS details;

-- ═══════════════════════════════════════════════════════════
-- 6. Drop unused helper functions
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS marketing_get_run_stats(uuid);
DROP FUNCTION IF EXISTS marketing_get_verified_contacts(uuid, integer, integer, boolean);
