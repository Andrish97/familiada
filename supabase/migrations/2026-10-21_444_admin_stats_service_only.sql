-- Bezpieczeństwo (dokończenie migracji 443): statystyki panelu, lista ocen
-- z adresami e-mail i wykluczenia ze statystyk tylko dla service_role.
-- Panel admina woła je przez Worker (/_admin_api/stats/overview,
-- /stats/retention, /ratings, /stats/excluded -- za Cloudflare Access).
-- get_app_rating_stats (sama średnia i liczba ocen) zostaje publiczna:
-- strona główna pokazuje ją wszystkim.

DO $$
DECLARE
  fn record;
  n int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public' AND p.proname IN (
      'get_admin_stats', 'get_retention_stats', 'get_ratings_admin',
      'stats_excluded_list', 'stats_exclude_user', 'stats_unexclude_user')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
  END LOOP;
  IF n < 6 THEN
    RAISE EXCEPTION 'admin_stats_service_only: oczekiwano 6 funkcji, jest %', n;
  END IF;
END $$;
