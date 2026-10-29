-- Migration: Fix marketing_get_verified_contacts function return type
-- SUPERSEDES: 2026-04-15_140_remove_unused_contact_columns.sql

DROP FUNCTION IF EXISTS marketing_get_verified_contacts(uuid, integer, integer, boolean);

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
    added_at timestamptz
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
        vc.added_at
    FROM marketing_verified_contacts vc
    WHERE (p_run_id IS NULL OR vc.run_id = p_run_id)
      AND (p_only_unused = false OR vc.is_used = false)
    ORDER BY vc.added_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
