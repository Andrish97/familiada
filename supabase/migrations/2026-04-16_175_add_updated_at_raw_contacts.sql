-- Add updated_at column to marketing_raw_contacts for tracking changes
ALTER TABLE marketing_raw_contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger to auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_marketing_raw_contacts_updated_at ON marketing_raw_contacts;
CREATE TRIGGER update_marketing_raw_contacts_updated_at
    BEFORE UPDATE ON marketing_raw_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
