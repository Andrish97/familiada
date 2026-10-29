-- Migration: Remove unused columns from marketing_verified_contacts
-- Removes: contact_type, ai_confidence, ai_reasoning, is_event_organizer
-- (None of these are populated by the lead-finder script)

DROP INDEX IF EXISTS idx_marketing_verified_type;

ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS contact_type;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS ai_confidence;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS ai_reasoning;
ALTER TABLE marketing_verified_contacts DROP COLUMN IF EXISTS is_event_organizer;

CREATE OR REPLACE FUNCTION marketing_get_verified_contacts(
    p_run_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_only_unused boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    title text,
    short_description text,
    email text,
    url text,
    is_used boolean,
    added_at timestamptz,
    used_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vc.id,
        vc.title,
        vc.short_description,
        vc.email,
        vc.url,
        vc.is_used,
        vc.added_at,
        vc.used_at
    FROM marketing_verified_contacts vc
    WHERE (p_run_id IS NULL OR vc.run_id = p_run_id)
      AND (p_only_unused = false OR vc.is_used = false)
    ORDER BY vc.added_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
