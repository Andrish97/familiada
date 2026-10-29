-- Migration: Remove ai_score and seo_score from verified contacts
ALTER TABLE IF EXISTS marketing_verified_contacts 
DROP COLUMN IF EXISTS ai_score,
DROP COLUMN IF EXISTS seo_score;
