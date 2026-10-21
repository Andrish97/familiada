-- Bezpieczeństwo (audyt E24, 2026-10-21): tabele dostępne dla każdego
-- z publicznym kluczem. Na produkcji anon i authenticated miały pełne prawa
-- (SELECT/INSERT/UPDATE/DELETE), a tabele były bez RLS albo z politykami
-- USING (true): odczyt, zmiana i kasowanie danych bez logowania.
-- Żadna z nich nie jest czytana z przeglądarki -- korzystają z nich tylko
-- klucz serwisowy (Worker, funkcje Edge, lead-finder) i funkcje SECURITY
-- DEFINER. Zostaje service_role; RLS włączone, polityki usunięte.
-- Tabele marketingu czytane jeszcze przez panel admina -- migracja 447
-- (po przeniesieniu panelu do Workera).
-- Widok stats_exclusions_effective (prawa właściciela, omija RLS) czytają
-- tylko funkcje SECURITY DEFINER -- bez dostępu dla anon/authenticated.

DO $$
DECLARE
  t text;
  pol record;
  n int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['example_table', 'konta_do_stworzenia', 'schema_migrations', 'stats_excluded_users',
                           'email_providers', 'public_kv', 'marketing_cities', 'marketing_raw_contacts',
                           'marketing_search_queries_log']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    n := n + 1;
  END LOOP;
  IF n < 8 THEN
    RAISE EXCEPTION 'service_only_tables: zabezpieczono % tabel, oczekiwano co najmniej 8', n;
  END IF;
END $$;

REVOKE ALL ON TABLE public.stats_exclusions_effective FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stats_exclusions_effective TO service_role;
