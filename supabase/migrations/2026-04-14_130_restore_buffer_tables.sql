-- Migration: Restore buffer tables for Marketing Contacts
-- Architecture: History (Queries) -> Buffer (Raw Contacts) -> Verified (Final)

-- 1. HISTORY OF QUERIES
CREATE TABLE IF NOT EXISTS marketing_search_queries_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    query_text text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now()
);

-- 2. BUFFER OF RAW CONTACTS (Producer: SearXNG, Consumer: AI)
CREATE TABLE IF NOT EXISTS marketing_raw_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    url text NOT NULL UNIQUE,
    emails_found jsonb DEFAULT '[]'::jsonb,
    title text,
    status text DEFAULT 'pending', -- 'pending', 'processing', 'rejected'
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Ensure indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketing_raw_status ON marketing_raw_contacts(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_marketing_verified_url ON marketing_verified_contacts(url);
CREATE INDEX IF NOT EXISTS idx_marketing_verified_email_array ON marketing_verified_contacts(email);
