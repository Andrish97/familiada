-- Migration: Enable RLS on lead_search_urls table

-- 1. Włącz RLS
ALTER TABLE lead_search_urls ENABLE ROW LEVEL SECURITY;

-- 2. Dodaj politykę zezwalającą na pełny dostęp dla roli 'anon'
CREATE POLICY "anon_full_access_search_urls" ON lead_search_urls
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
