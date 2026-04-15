-- Migration: Add reason column to marketing_raw_contacts and marketing_verified_contacts
-- Raw: stores rejection reason
-- Verified: stores acceptance reason

ALTER TABLE marketing_raw_contacts ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE marketing_verified_contacts ADD COLUMN IF NOT EXISTS verify_reason TEXT;
