-- Migration: Fix fresh start and reset all caches
-- This migration fixes the failure of 111 and ensures a clean state.

-- 1. Usuń leady testowe (zostaw tylko te z importu CSV - Twoje 106)
DELETE FROM lead_finder WHERE source NOT IN ('import_csv');

-- 2. Wyczyść historię zadań
TRUNCATE TABLE lead_search_runs;

-- 3. Resetuj backlogi (cache)
UPDATE lead_finder_config SET value = '[]' WHERE key IN ('portal_backlog', 'search_backlog');

-- 4. Usuń zbędne/stare klucze
DELETE FROM lead_finder_config WHERE key IN (
    'all_cities', 'scan_status', 'search_request', 'search_status', 'cities_done'
);

-- 5. Ustaw czyste wartości startowe
INSERT INTO lead_finder_config (key, value) VALUES 
    ('search_heartbeat', ''),
    ('scan_request', 'idle'),
    ('brave_daily_count', '0'),
    ('brave_monthly_count', '0'),
    ('last_search_log', ''),
    ('search_stop_requested', 'false'),
    ('portal_backlog', '[]'),
    ('search_backlog', '[]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 6. Reset dat liczników (żeby system myślał, że jest nowy dzień/miesiąc)
UPDATE lead_finder_config SET value = '' WHERE key IN ('brave_daily_date', 'brave_monthly_date');

-- 7. Bezpieczne usunięcie starych cronów (ignoruj błędy)
DO $$
BEGIN
    DELETE FROM cron.job WHERE jobname IN ('trigger_scan', 'scan_request_trigger');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. Dodaj nowy Cron (skanowanie co 6h)
SELECT cron.schedule(
    'scan_request_trigger', 
    '0 */6 * * *', 
    $$ UPDATE lead_finder_config SET value = 'pending' WHERE key = 'scan_request' AND value != 'pending' $$
);
