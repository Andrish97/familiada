-- Migration: Fix marketing_get_run_stats function syntax error
-- The original function has a stray semicolon before FROM clause

CREATE OR REPLACE FUNCTION marketing_get_run_stats(p_run_id uuid)
RETURNS TABLE (
    run_status text,
    target_count integer,
    urls_found bigint,
    urls_processed bigint,
    raw_contacts bigint,
    verified_contacts bigint,
    contacts_used bigint,
    logs_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.status,
        r.target_count,
        (SELECT COUNT(*) FROM marketing_search_urls u WHERE u.run_id = p_run_id),
        (SELECT COUNT(*) FROM marketing_search_urls u WHERE u.run_id = p_run_id AND u.status = 'collected'),
        (SELECT COUNT(*) FROM marketing_raw_contacts rc WHERE rc.run_id = p_run_id),
        (SELECT COUNT(*) FROM marketing_verified_contacts vc WHERE vc.run_id = p_run_id),
        (SELECT COUNT(*) FROM marketing_verified_contacts vc WHERE vc.run_id = p_run_id AND vc.is_used = true),
        (SELECT COUNT(*) FROM marketing_search_logs sl WHERE sl.run_id = p_run_id)
    FROM marketing_search_runs r
    WHERE r.id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear hardcoded API keys from 120_migration
UPDATE marketing_lead_config SET value = '' WHERE key = 'ai_api_key';
UPDATE marketing_lead_config SET value = '' WHERE key = 'searxng_api_key';
