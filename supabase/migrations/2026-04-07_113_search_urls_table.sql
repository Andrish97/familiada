-- Migration: Proper table for search URLs instead of JSON blob in config
-- SUPERSEDES: 2026-04-07_112_fix_fresh_start.sql (partial)

-- 1. Usuń stare JSON-owe backlogi z config
DELETE FROM lead_finder_config WHERE key IN ('portal_backlog', 'search_backlog');

-- 2. Tabela na WSZYSTKIE znalezione URL-e (firmy + portale)
CREATE TABLE IF NOT EXISTS lead_search_urls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    url text NOT NULL UNIQUE,
    city text,
    source text DEFAULT 'brave', -- 'brave', 'portal', 'sitemap'
    status text DEFAULT 'pending', -- 'pending', 'checked', 'accepted', 'rejected'
    ai_valid boolean,
    ai_reason text,
    found_emails jsonb DEFAULT '[]'::jsonb,
    checked_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Indeksy dla szybkości
CREATE INDEX IF NOT EXISTS idx_search_urls_status ON lead_search_urls(status);
CREATE INDEX IF NOT EXISTS idx_search_urls_source ON lead_search_urls(source);
CREATE INDEX IF NOT EXISTS idx_search_urls_created ON lead_search_urls(created_at);

-- 3. Przenieś istniejące dane z JSON do tabeli (jeśli są)
DO $$
DECLARE
    portal_data jsonb;
    search_data jsonb;
    item jsonb;
BEGIN
    -- Przenieś portal_backlog
    BEGIN
        SELECT value::jsonb INTO portal_data FROM lead_finder_config WHERE key = 'portal_backlog';
        IF portal_data IS NOT NULL AND jsonb_array_length(portal_data) > 0 THEN
            FOR item IN SELECT * FROM jsonb_array_elements(portal_data) LOOP
                INSERT INTO lead_search_urls (url, city, source, status)
                VALUES (
                    item->>0,
                    item->>1,
                    item->>2,
                    'pending'
                ) ON CONFLICT (url) DO NOTHING;
            END LOOP;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Przenieś search_backlog
    BEGIN
        SELECT value::jsonb INTO search_data FROM lead_finder_config WHERE key = 'search_backlog';
        IF search_data IS NOT NULL AND jsonb_array_length(search_data) > 0 THEN
            FOR item IN SELECT * FROM jsonb_array_elements(search_data) LOOP
                INSERT INTO lead_search_urls (url, city, source, status)
                VALUES (
                    item->>0,
                    item->>1,
                    item->>2,
                    'pending'
                ) ON CONFLICT (url) DO NOTHING;
            END LOOP;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- 4. Ustaw Cron skanowania co 6h
SELECT cron.unschedule('scan_request_trigger');
SELECT cron.schedule(
    'scan_request_trigger', 
    '0 */6 * * *', 
    $$ UPDATE lead_finder_config SET value = 'pending' WHERE key = 'scan_request' AND value != 'pending' $$
);
