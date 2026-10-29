-- Add retry_count column to marketing_raw_contacts for rate limit handling
ALTER TABLE marketing_raw_contacts ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Update existing rows to have 0 retries
UPDATE marketing_raw_contacts SET retry_count = 0 WHERE retry_count IS NULL;
