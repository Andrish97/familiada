-- Migration: Simplify marketing_verified_contacts - remove used_at, notes
-- is_used is now just a boolean flag, used contacts are visually highlighted

-- Drop unused columns
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS used_at;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS notes;

-- Recreate index without used_at if needed
-- No other schema changes needed, is_used remains
