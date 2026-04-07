-- Fix RLS policies for lead_finder tables to allow full access
DROP POLICY IF EXISTS "allow_all" ON lead_finder;
CREATE POLICY "allow_all" ON lead_finder FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all" ON lead_finder_config;
CREATE POLICY "allow_all" ON lead_finder_config FOR ALL USING (true) WITH CHECK (true);
