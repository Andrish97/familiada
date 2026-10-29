-- Add page_text column to marketing_raw_contacts for AI context
ALTER TABLE marketing_raw_contacts ADD COLUMN IF NOT EXISTS page_text text;
