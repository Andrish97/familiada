-- Migration: Finalne tabele - search_queries + search_urls
-- SUPERSEDES: 2026-04-07_115_cleanup_simple_cache.sql

-- 1. Usuń starą tabelę
DROP TABLE IF EXISTS search_query_cache;

-- 2. Usuń zbędne klucze
DELETE FROM lead_finder_config WHERE key IN ('scan_request', 'portal_backlog', 'search_backlog', 'search_heartbeat');

-- 3. Tabela ZAPYTAŃ (same hashe, żeby nie powtarzać Brave)
CREATE TABLE IF NOT EXISTS search_queries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    query_hash text NOT NULL UNIQUE,
    query_text text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 4. Tabela URL-i (pula linków do weryfikacji)
CREATE TABLE IF NOT EXISTS search_urls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    url text NOT NULL UNIQUE,
    source text DEFAULT 'brave',
    status text DEFAULT 'pending', -- pending, processed, rejected
    created_at timestamptz DEFAULT now()
);

-- 5. RLS
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_q" ON search_queries FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE search_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_u" ON search_urls FOR ALL TO anon USING (true) WITH CHECK (true);
