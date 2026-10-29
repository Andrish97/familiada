-- Bezpieczeństwo (audyt E24, 2026-10-21): tabele panelu marketingu miały
-- polityki ALL USING (true) i pełne prawa anon/authenticated -- adresy
-- e-mail kontaktów i logi wyszukiwania dało się czytać, zmieniać i kasować
-- bez logowania. Panel admina czyta je już przez Worker
-- (/_admin_api/marketing/*, klucz serwisowy, za Cloudflare Access),
-- lead-finder używa klucza serwisowego. Zostaje service_role.

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_ai_providers', 'marketing_search_logs', 'marketing_verified_contacts']
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;
