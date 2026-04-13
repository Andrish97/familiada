-- Migration: Marketing Contacts - Lead Finder System
-- Creates tables for multi-layer lead search: SearXNG -> Email Collection -> AI Verification

-- ═══════════════════════════════════════════════════════════
-- 1. SEARCH RUNS - Tracks each search job/order
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_search_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    status text NOT NULL DEFAULT 'pending', -- pending, running, paused, completed, cancelled, error
    target_count integer NOT NULL DEFAULT 50, -- How many verified contacts we want
    queries_used jsonb DEFAULT '[]'::jsonb, -- Array of query strings used
    cities_used jsonb DEFAULT '[]'::jsonb, -- Array of cities used in queries
    started_at timestamptz,
    completed_at timestamptz,
    paused_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by text, -- user identifier
    error_message text,
    contacts_found integer DEFAULT 0,
    contacts_verified integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_marketing_runs_status ON marketing_search_runs(status);
CREATE INDEX IF NOT EXISTS idx_marketing_runs_created ON marketing_search_runs(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 2. SEARCH QUERIES LOG - Tracks all queries sent to SearXNG
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_search_queries_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    query_text text NOT NULL,
    city text NOT NULL,
    full_query text NOT NULL,
    status text DEFAULT 'pending', -- pending, searching, completed, error
    urls_found integer DEFAULT 0,
    searched_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_queries_log_run ON marketing_search_queries_log(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_queries_log_status ON marketing_search_queries_log(status);

-- ═══════════════════════════════════════════════════════════
-- 3. SEARCH URLS - URLs found from SearXNG search
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_search_urls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    url text NOT NULL UNIQUE,
    source_query text, -- The query that found this URL
    domain text, -- Extracted domain for blocking
    status text DEFAULT 'pending', -- pending, collecting_emails, collected, rejected, error
    blocked_reason text, -- Why it was rejected (blocked domain, duplicate, etc.)
    page_title text,
    page_description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_urls_run ON marketing_search_urls(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_urls_status ON marketing_search_urls(status);
CREATE INDEX IF NOT EXISTS idx_marketing_urls_domain ON marketing_search_urls(domain);

-- ═══════════════════════════════════════════════════════════
-- 4. RAW CONTACTS - URLs with emails before AI verification
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_raw_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    url text NOT NULL,
    emails_found jsonb DEFAULT '[]'::jsonb, -- Array of emails found on the page
    primary_email text, -- The main contact email (if multiple found)
    page_title text,
    page_content_snippet text, -- First 500 chars of page content
    status text DEFAULT 'pending', -- pending, processing, verified, rejected, used
    processed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_raw_run ON marketing_raw_contacts(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_raw_status ON marketing_raw_contacts(status);
CREATE INDEX IF NOT EXISTS idx_marketing_raw_email ON marketing_raw_contacts USING GIN (emails_found);

-- ═══════════════════════════════════════════════════════════
-- 5. VERIFIED CONTACTS - Final contacts after AI verification
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_verified_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    title text, -- Company/person name
    short_description text, -- Brief description of services
    email text NOT NULL,
    url text NOT NULL,
    is_event_organizer boolean, -- AI verification result
    ai_confidence text, -- AI confidence: high, medium, low
    ai_reasoning text, -- Why AI thinks this is/isn't a valid contact
    contact_type text, -- DJ, Wodzirej, Animator, Agencja, etc.
    is_used boolean DEFAULT false, -- Marked as used by admin
    notes text, -- Admin notes
    added_at timestamptz DEFAULT now(),
    used_at timestamptz,
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_verified_run ON marketing_verified_contacts(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_email ON marketing_verified_contacts(email);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_used ON marketing_verified_contacts(is_used);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_type ON marketing_verified_contacts(contact_type);

-- ═══════════════════════════════════════════════════════════
-- 6. SEARCH LOGS - Real-time logs displayed in UI
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_search_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid REFERENCES marketing_search_runs(id) ON DELETE CASCADE,
    level text NOT NULL DEFAULT 'info', -- info, warning, error, success
    message text NOT NULL,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_logs_run ON marketing_search_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_created ON marketing_search_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 7. CONFIG - Key-value config for the lead finder system
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_lead_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- Default config values
INSERT INTO marketing_lead_config (key, value) VALUES
    ('ai_endpoint', 'https://ai.familiada.online'),
    ('ai_api_key', 'T8nlltKGOxvzKzAEt3Jut0T85W5r1IPM'),
    ('ai_model', 'qwen2.5'),
    ('searxng_endpoint', 'https://search.familiada.online'),
    ('searxng_api_key', 'JCSko3QXMltQ0cIZr45IRf21REXr6s6o'),
    ('telegram_notify', 'true'),
    ('max_concurrent_requests', '5'),
    ('request_delay_ms', '1000'),
    ('contact_page_timeout_ms', '10000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ═══════════════════════════════════════════════════════════
-- 8. POLISH CITIES - List of cities for search queries
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_cities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    is_active boolean DEFAULT true,
    search_count integer DEFAULT 0,
    last_searched timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Insert major Polish cities
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
-- 9. RLS POLICIES - Row Level Security
-- ═══════════════════════════════════════════════════════════
ALTER TABLE marketing_search_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_runs_all" ON marketing_search_runs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_search_queries_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_queries_log_all" ON marketing_search_queries_log FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_search_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_urls_all" ON marketing_search_urls FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_raw_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_raw_all" ON marketing_raw_contacts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_verified_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_verified_all" ON marketing_verified_contacts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_logs_all" ON marketing_search_logs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_lead_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_config_all" ON marketing_lead_config FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE marketing_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_cities_all" ON marketing_cities FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 10. TRIGGERS - Auto-update updated_at
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketing_runs_updated_at
    BEFORE UPDATE ON marketing_search_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_urls_updated_at
    BEFORE UPDATE ON marketing_search_urls
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_raw_updated_at
    BEFORE UPDATE ON marketing_raw_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_verified_updated_at
    BEFORE UPDATE ON marketing_verified_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_config_updated_at
    BEFORE UPDATE ON marketing_lead_config
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 11. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Get stats for a search run
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
        (SELECT COUNT(*) FROM marketing_search_logs sl WHERE sl.run_id = p_run_id);
    FROM marketing_search_runs r
    WHERE r.id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all verified contacts with pagination
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
