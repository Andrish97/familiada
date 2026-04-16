-- Remove unused retry_count column from marketing_raw_contacts
ALTER TABLE marketing_raw_contacts DROP COLUMN IF EXISTS retry_count;
