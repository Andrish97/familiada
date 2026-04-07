-- Migration: Sprzątanie - usunięcie crona, skanowania w tle, prosta tabela cache zapytań Brave
-- SUPERSEDES: 2026-04-07_113_search_urls_table.sql
-- SUPERSEDES: 2026-04-07_114_enable_rls_search_urls.sql

-- 1. Usuń Cron skanowania
SELECT cron.unschedule('scan_request_trigger');

-- 2. Usuń tabelę lead_search_urls (nie będzie używana)
DROP TABLE IF EXISTS lead_search_urls;

-- 3. Usuń zbędne klucze z config
DELETE FROM lead_finder_config WHERE key IN (
    'scan_request', 'portal_backlog', 'search_backlog',
    'search_heartbeat', 'search_stop_requested'
);

-- 4. Utwórz tabelę cache zapytań Brave (hash zapytania -> lista URL-i)
CREATE TABLE IF NOT EXISTS search_query_cache (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    query_hash text NOT NULL UNIQUE,  -- SHA256 z zapytania np. '"Wodzirej" Zabrze kontakt'
    query_text text NOT NULL,         -- Oryginalne zapytanie (do podglądu)
    city text,
    urls jsonb DEFAULT '[]'::jsonb,   -- Lista URL-i znalezionych przez Brave
    status text DEFAULT 'pending',    -- 'pending' -> 'processed'
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cache_status ON search_query_cache(status);
CREATE INDEX IF NOT EXISTS idx_cache_hash ON search_query_cache(query_hash);

-- 5. RLS dla cache
ALTER TABLE search_query_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_full_access_cache" ON search_query_cache
FOR ALL TO anon
USING (true) WITH CHECK (true);

-- 6. Dodaj nowy klucz config (opcjonalny)
INSERT INTO lead_finder_config (key, value) VALUES ('last_search_log', '')
ON CONFLICT (key) DO NOTHING;
