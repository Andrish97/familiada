-- Migration: Dodanie klucza collect_request i porządki

-- 1. Dodaj klucz collect_request (używany do triggerowania collectora z bazy)
INSERT INTO lead_finder_config (key, value) VALUES ('collect_request', 'idle')
ON CONFLICT (key) DO NOTHING;

-- 2. Usuń stare, nieużywane klucze
DELETE FROM lead_finder_config WHERE key IN (
    'search_status', 'cities_done', 'all_cities', 'scan_status', 'search_request'
);
