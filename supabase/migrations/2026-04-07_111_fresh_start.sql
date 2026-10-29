-- Migration: Fresh start - clean cache, optimize config, keep only original 106 leads
-- SUPERSEDES: 2026-04-07_109_setup_scan_cron.sql
-- SUPERSEDES: 2026-04-07_110_setup_scan_cron.sql

-- 1. Usuń leady wygenerowane przez testy/skrypty (zostaw tylko 'import_csv')
DELETE FROM lead_finder WHERE source NOT IN ('import_csv');

-- 2. Wyczyść historię zadań i resetuj backlogi
TRUNCATE TABLE lead_search_runs;
UPDATE lead_finder_config SET value = '[]' WHERE key IN ('portal_backlog', 'search_backlog');

-- 3. Usuń stare/zbędne klucze
DELETE FROM lead_finder_config WHERE key IN (
    'all_cities', 'scan_status', 'search_request', 'search_status', 'cities_done'
);

-- 4. Ustaw czyste wartości startowe
INSERT INTO lead_finder_config (key, value) VALUES 
    ('search_heartbeat', ''),
    ('scan_request', 'idle'),
    ('brave_daily_count', '0'),
    ('brave_monthly_count', '0'),
    ('last_search_log', ''),
    ('search_stop_requested', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 5. Zresetuj daty liczników
UPDATE lead_finder_config SET value = '' WHERE key IN ('brave_daily_date', 'brave_monthly_date');

-- 6. Ustaw Cron skanowania co 6h
SELECT cron.unschedule('trigger_scan');
SELECT cron.unschedule('scan_request_trigger');
SELECT cron.schedule(
    'scan_request_trigger', 
    '0 */6 * * *', 
    $$ UPDATE lead_finder_config SET value = 'pending' WHERE key = 'scan_request' AND value != 'pending' $$
);
