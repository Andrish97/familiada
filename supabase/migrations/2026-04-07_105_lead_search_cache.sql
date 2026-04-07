-- Tabela cache'u wyszukiwań - żeby nie powtarzać tych samych zapytań
CREATE TABLE IF NOT EXISTS lead_search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    title TEXT DEFAULT '',
    source TEXT DEFAULT '',
    city TEXT DEFAULT '',
    used BOOLEAN NOT NULL DEFAULT FALSE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexy
CREATE INDEX IF NOT EXISTS idx_lead_cache_query ON lead_search_cache(query);
CREATE INDEX IF NOT EXISTS idx_lead_cache_used ON lead_search_cache(used);

-- RLS
ALTER TABLE lead_search_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON lead_search_cache;
CREATE POLICY "allow_all" ON lead_search_cache FOR ALL USING (true) WITH CHECK (true);
