-- Migration: Finalna Architektura (Collect vs Verify)

-- 1. Usuń stare, popsute tabele (jeśli istnieją)
DROP TABLE IF EXISTS search_urls;
DROP TABLE IF EXISTS search_queries;

-- 2. Tabela Zapytań (Pula haseł do Brave)
CREATE TABLE search_queries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    query_text text NOT NULL,
    query_hash text NOT NULL UNIQUE,
    exhausted boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- 3. Tabela URL-i (Pula linków z nowymi mailami - gotowa do AI)
CREATE TABLE search_urls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    url text NOT NULL UNIQUE,
    source text DEFAULT 'brave',
    found_emails jsonb DEFAULT '[]'::jsonb, -- Lista NOWYCH maili znalezionych przez skrypt
    title text, -- Tytuł strony zapisany podczas skanowania
    status text DEFAULT 'pending', -- pending -> processed / rejected
    created_at timestamptz DEFAULT now()
);

-- 4. RLS (Uprawnienia)
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_sq" ON search_queries FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE search_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_su" ON search_urls FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Wyczyść śmieci w configu i dodaj nowe flagi
DELETE FROM lead_finder_config WHERE key IN (
    'scan_request', 'verify_request', 'search_stop_requested', 
    'brave_daily_count', 'brave_monthly_count', 'search_backlog', 'portal_backlog'
);

INSERT INTO lead_finder_config (key, value) VALUES 
    ('collect_request', 'idle'),       -- idle | boost | auto
    ('verify_request', 'idle'),        -- idle | pending (json: {target: X})
    ('search_stop_requested', 'false'),
    ('brave_daily_count', '0'),
    ('brave_daily_date', ''),
    ('brave_monthly_count', '0'),
    ('brave_monthly_date', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 6. Dodaj przykładowe zapytania (żeby nie zaczynać od pustej bazy)
INSERT INTO search_queries (query_text, query_hash)
SELECT q, md5(q) FROM (VALUES 
    ('"DJ" "wesele" Warszawa kontakt'), ('"Wodzirej" Kraków kontakt'), ('"Animator dzieci" Gdańsk kontakt')
) AS t(q)
ON CONFLICT (query_hash) DO NOTHING;
