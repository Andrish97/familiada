-- Migration: Remove remaining unused columns from marketing_verified_contacts
-- These columns are not populated by lead-finder script

DROP INDEX IF EXISTS idx_marketing_verified_type;

ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS is_event_organizer;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS ai_confidence;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS ai_reasoning;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS contact_type;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS run_id;
