-- SUPERSEDES: 2026-04-07_104_fix_lead_finder_rls.sql
-- Pełna naprawa: RLS policies + brakujące klucze konfiguracyjne

-- Naprawa polityk RLS dla lead_finder
DROP POLICY IF EXISTS "allow_all" ON lead_finder;
CREATE POLICY "allow_all" ON lead_finder FOR ALL USING (true) WITH CHECK (true);

-- Naprawa polityk RLS dla lead_finder_config
DROP POLICY IF EXISTS "allow_all" ON lead_finder_config;
CREATE POLICY "allow_all" ON lead_finder_config FOR ALL USING (true) WITH CHECK (true);

-- Dodaj brakujące klucze konfiguracyjne
INSERT INTO lead_finder_config (key, value) VALUES 
  ('search_stop_requested', 'false'),
  ('brave_daily_limit', '33')
ON CONFLICT (key) DO NOTHING;
