-- Migration: Ustawienie harmonogramu skanowania portali w Supabase
-- Ten wpis sprawi, że co 6 godzin Supabase samo zmieni status w bazie na 'pending'.
-- Serwer (portal_scanner_daemon.py) wykryje tę zmianę i odpali skanowanie.

-- 1. Upewniamy się, że klucz konfiguracyjny istnieje
INSERT INTO lead_finder_config (key, value) VALUES ('scan_status', 'idle')
ON CONFLICT (key) DO NOTHING;

-- 2. Dodajemy zadanie Crona (Uruchamiaj co 6 godzin: 00:00, 06:00, 12:00, 18:00)
-- UWAGA: Wymaga włączonego rozszerzenia pg_cron w Twojej instancji Supabase.
SELECT cron.schedule(
    'trigger_scan', 
    '0 */6 * * *', 
    $$ UPDATE lead_finder_config SET value = 'pending' WHERE key = 'scan_status' $$
);
