-- 2026-04-15_157_marketing_cleanup.sql
-- Remove population column from marketing_cities and cleanup small cities

-- Keep only cities with population >= 40000
DELETE FROM marketing_cities WHERE population < 40000;

-- Remove population column (no longer needed)
ALTER TABLE marketing_cities DROP COLUMN IF EXISTS population;
