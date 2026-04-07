-- Migration 103: Lead Finder
-- Tabela leadów + config na API keyi

-- 1) Tabela leadów
CREATE TABLE IF NOT EXISTS lead_finder (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '',
    city TEXT DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    url TEXT DEFAULT '',
    source TEXT DEFAULT '',
    active TEXT DEFAULT '',
    extra_emails TEXT DEFAULT '',
    used BOOLEAN NOT NULL DEFAULT FALSE,
    added_by UUID REFERENCES auth.users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_finder_email ON lead_finder(email);
CREATE INDEX IF NOT EXISTS idx_lead_finder_used ON lead_finder(used);
CREATE INDEX IF NOT EXISTS idx_lead_finder_source ON lead_finder(source);
CREATE INDEX IF NOT EXISTS idx_lead_finder_added_at ON lead_finder(added_at DESC);

-- 2) Tabela config (API keyi)
CREATE TABLE IF NOT EXISTS lead_finder_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Domyślny pusty klucz Brave
INSERT INTO lead_finder_config (key, value)
VALUES ('brave_api_key', ''),
       ('brave_daily_date', ''),
       ('brave_daily_count', '0'),
       ('brave_daily_limit', '33'),
       ('brave_monthly_date', ''),
       ('brave_monthly_count', '0'),
       ('brave_monthly_limit', '1000'),
       ('last_search_log', ''),
       ('search_status', '{}'),
       ('cities_done', '0'),
       ('search_request', ''),
       ('all_cities', '')
ON CONFLICT (key) DO NOTHING;

-- RLS na lead_finder
ALTER TABLE lead_finder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_finder_select" ON lead_finder
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_finder_insert" ON lead_finder
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lead_finder_update" ON lead_finder
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "lead_finder_delete" ON lead_finder
    FOR DELETE TO authenticated USING (true);

-- RLS na config (tylko auth mogą czytać/zapisywać)
ALTER TABLE lead_finder_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lf_config_select" ON lead_finder_config
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "lf_config_insert" ON lead_finder_config
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lf_config_update" ON lead_finder_config
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_lead_finder_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_finder_updated_at ON lead_finder;
CREATE TRIGGER trg_lead_finder_updated_at
    BEFORE UPDATE ON lead_finder
    FOR EACH ROW
    EXECUTE FUNCTION update_lead_finder_updated_at();

DROP TRIGGER IF EXISTS trg_lead_finder_config_updated_at ON lead_finder_config;
CREATE TRIGGER trg_lead_finder_config_updated_at
    BEFORE UPDATE ON lead_finder_config
    FOR EACH ROW
    EXECUTE FUNCTION update_lead_finder_updated_at();

