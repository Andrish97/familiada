-- Dodaj tabelę aktywnych wyszukiwań (żeby można było wznowić po limicie)
CREATE TABLE IF NOT EXISTS lead_search_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target INT NOT NULL,
    found INT NOT NULL DEFAULT 0,
    api_calls INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running', -- running, stopped, completed, limit_reached
    cities_done INT NOT NULL DEFAULT 0,
    cities_list JSONB DEFAULT '[]',
    reason TEXT DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_search_runs_status ON lead_search_runs(status);

-- RLS
ALTER TABLE lead_search_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON lead_search_runs;
CREATE POLICY "allow_all" ON lead_search_runs FOR ALL USING (true) WITH CHECK (true);
