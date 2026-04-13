-- Migration: Recreate marketing contacts tables (120 failed, this replaces it)
-- Fixes: marketing_get_run_stats syntax error, empty API keys

-- ═══════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_search_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    status text NOT NULL DEFAULT 'pending',
    target_count integer NOT NULL DEFAULT 50,
    queries_used jsonb DEFAULT '[]'::jsonb,
    cities_used jsonb DEFAULT '[]'::jsonb,
    started_at timestamptz,
    completed_at timestamptz,
    paused_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by text,
    error_message text,
    contacts_found integer DEFAULT 0,
    contacts_verified integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marketing_search_queries_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    query_text text NOT NULL,
    city text NOT NULL,
    full_query text NOT NULL,
    status text DEFAULT 'pending',
    urls_found integer DEFAULT 0,
    searched_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_search_urls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    url text NOT NULL UNIQUE,
    source_query text,
    domain text,
    status text DEFAULT 'pending',
    blocked_reason text,
    page_title text,
    page_description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_raw_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    url text NOT NULL,
    emails_found jsonb DEFAULT '[]'::jsonb,
    primary_email text,
    page_title text,
    page_content_snippet text,
    status text DEFAULT 'pending',
    processed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_verified_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    title text,
    short_description text,
    email text NOT NULL,
    url text NOT NULL,
    is_event_organizer boolean,
    ai_confidence text,
    ai_reasoning text,
    contact_type text,
    is_used boolean DEFAULT false,
    notes text,
    added_at timestamptz DEFAULT now(),
    used_at timestamptz,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_search_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    level text NOT NULL DEFAULT 'info',
    message text NOT NULL,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_lead_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_cities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    is_active boolean DEFAULT true,
    search_count integer DEFAULT 0,
    last_searched timestamptz,
    created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 2. INDEXES
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_marketing_runs_status ON marketing_search_runs(status);
CREATE INDEX IF NOT EXISTS idx_marketing_runs_created ON marketing_search_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_queries_log_run ON marketing_search_queries_log(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_queries_log_status ON marketing_search_queries_log(status);
CREATE INDEX IF NOT EXISTS idx_marketing_urls_run ON marketing_search_urls(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_urls_status ON marketing_search_urls(status);
CREATE INDEX IF NOT EXISTS idx_marketing_urls_domain ON marketing_search_urls(domain);
CREATE INDEX IF NOT EXISTS idx_marketing_raw_run ON marketing_raw_contacts(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_raw_status ON marketing_raw_contacts(status);
CREATE INDEX IF NOT EXISTS idx_marketing_raw_email ON marketing_raw_contacts USING GIN (emails_found);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_run ON marketing_verified_contacts(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_email ON marketing_verified_contacts(email);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_used ON marketing_verified_contacts(is_used);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_type ON marketing_verified_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_run ON marketing_search_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_created ON marketing_search_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 3. CONFIG DATA (API keys empty — set from docker/.env)
-- ═══════════════════════════════════════════════════════════
INSERT INTO marketing_lead_config (key, value) VALUES
    ('ai_endpoint', 'https://ai.familiada.online'),
    ('ai_api_key', ''),
    ('ai_model', 'qwen2.5'),
    ('searxng_endpoint', 'https://search.familiada.online'),
    ('searxng_api_key', ''),
    ('telegram_notify', 'true'),
    ('max_concurrent_requests', '5'),
    ('request_delay_ms', '1000'),
    ('contact_page_timeout_ms', '10000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ═══════════════════════════════════════════════════════════
-- 4. CITIES
-- ═══════════════════════════════════════════════════════════
INSERT INTO marketing_cities (name) VALUES
    ('Warszawa'), ('Kraków'), ('Gdańsk'), ('Wrocław'), ('Poznań'),
    ('Łódź'), ('Katowice'), ('Lublin'), ('Szczecin'), ('Bydgoszcz'),
    ('Białystok'), ('Gdynia'), ('Częstochowa'), ('Radom'), ('Sosnowiec'),
    ('Toruń'), ('Kielce'), ('Rzeszów'), ('Gliwice'), ('Zabrze'),
    ('Olsztyn'), ('Bielsko-Biała'), ('Ruda Śląska'), ('Rybnik'), ('Tychy'),
    ('Dąbrowa Górnicza'), ('Płock'), ('Elbląg'), ('Opole'), ('Gorzów Wielkopolski'),
    ('Wałbrzych'), ('Włocławek'), ('Tarnów'), ('Chorzów'), ('Koszalin'),
    ('Kalisz'), ('Legnica'), ('Grudziądz'), ('Jaworzno'), ('Jastrzębie-Zdrój'),
    ('Nowy Sącz'), ('Jelenia Góra'), ('Siedlce'), ('Mysłowice'), ('Piła'),
    ('Inowrocław'), ('Lubin'), ('Ostrów Wielkopolski'), ('Ostrowiec Świętokrzyski'), ('Gniezno')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════
ALTER TABLE marketing_search_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_runs_all" ON marketing_search_runs;
CREATE POLICY "marketing_runs_all" ON marketing_search_runs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_search_queries_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_queries_log_all" ON marketing_search_queries_log;
CREATE POLICY "marketing_queries_log_all" ON marketing_search_queries_log FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_search_urls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_urls_all" ON marketing_search_urls;
CREATE POLICY "marketing_urls_all" ON marketing_search_urls FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_raw_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_raw_all" ON marketing_raw_contacts;
CREATE POLICY "marketing_raw_all" ON marketing_raw_contacts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_verified_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_verified_all" ON marketing_verified_contacts;
CREATE POLICY "marketing_verified_all" ON marketing_verified_contacts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_search_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_logs_all" ON marketing_search_logs;
CREATE POLICY "marketing_logs_all" ON marketing_search_logs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_lead_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_config_all" ON marketing_lead_config;
CREATE POLICY "marketing_config_all" ON marketing_lead_config FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_cities_all" ON marketing_cities;
CREATE POLICY "marketing_cities_all" ON marketing_cities FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 6. TRIGGERS
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_runs_updated_at ON marketing_search_runs;
CREATE TRIGGER trg_marketing_runs_updated_at
    BEFORE UPDATE ON marketing_search_runs
    FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_urls_updated_at ON marketing_search_urls;
CREATE TRIGGER trg_marketing_urls_updated_at
    BEFORE UPDATE ON marketing_search_urls
    FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_raw_updated_at ON marketing_raw_contacts;
CREATE TRIGGER trg_marketing_raw_updated_at
    BEFORE UPDATE ON marketing_raw_contacts
    FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_verified_updated_at ON marketing_verified_contacts;
CREATE TRIGGER trg_marketing_verified_updated_at
    BEFORE UPDATE ON marketing_verified_contacts
    FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_config_updated_at ON marketing_lead_config;
CREATE TRIGGER trg_marketing_config_updated_at
    BEFORE UPDATE ON marketing_lead_config
    FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 7. HELPER FUNCTIONS (fixed syntax)
-- ═══════════════════════════════════════════════════════════

-- Fix: marketing_get_run_stats — removed stray semicolon before FROM
CREATE OR REPLACE FUNCTION marketing_get_run_stats(p_run_id uuid)
RETURNS TABLE (
    run_status text,
    target_count integer,
    urls_found bigint,
    urls_processed bigint,
    raw_contacts bigint,
    verified_contacts bigint,
    contacts_used bigint,
    logs_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.status,
        r.target_count,
        (SELECT COUNT(*) FROM marketing_search_urls u WHERE u.run_id = p_run_id),
        (SELECT COUNT(*) FROM marketing_search_urls u WHERE u.run_id = p_run_id AND u.status = 'collected'),
        (SELECT COUNT(*) FROM marketing_raw_contacts rc WHERE rc.run_id = p_run_id),
        (SELECT COUNT(*) FROM marketing_verified_contacts vc WHERE vc.run_id = p_run_id),
        (SELECT COUNT(*) FROM marketing_verified_contacts vc WHERE vc.run_id = p_run_id AND vc.is_used = true),
        (SELECT COUNT(*) FROM marketing_search_logs sl WHERE sl.run_id = p_run_id)
    FROM marketing_search_runs r
    WHERE r.id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION marketing_get_verified_contacts(
    p_run_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_only_unused boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    title text,
    short_description text,
    email text,
    url text,
    contact_type text,
    is_used boolean,
    added_at timestamptz,
    used_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vc.id,
        vc.title,
        vc.short_description,
        vc.email,
        vc.url,
        vc.contact_type,
        vc.is_used,
        vc.added_at,
        vc.used_at
    FROM marketing_verified_contacts vc
    WHERE (p_run_id IS NULL OR vc.run_id = p_run_id)
      AND (p_only_unused = false OR vc.is_used = false)
    ORDER BY vc.added_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
