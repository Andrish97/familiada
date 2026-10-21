-- Oceny aplikacji bez kont testowych (zgłoszenie użytkownika 2026-10-21):
-- średnia na stronie głównej i lista w panelu admina liczyły też oceny kont
-- testowych (np. test1 „E2E ocena”), bo wykluczenia z migracji 304
-- (stats_exclusions_effective) objęły tylko funkcje statystyk. Ta sama reguła
-- co w statystykach: konta testN@familiada.online, testowi goście i ręczne
-- wykluczenia. Sygnatury bez zmian; uprawnienia zostają (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_app_rating_stats() RETURNS TABLE(avg_stars numeric, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    COALESCE(ROUND(AVG(r.stars), 1), 0.0) AS avg_stars,
    COUNT(*) AS total_count
  FROM public.app_ratings r
  WHERE NOT EXISTS (SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id = r.user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_ratings_admin() RETURNS TABLE(id uuid, user_id uuid, stars smallint, comment text, created_at timestamp with time zone, username text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
  SELECT
    r.id,
    r.user_id,
    r.stars,
    r.comment,
    r.created_at,
    p.username,
    p.email
  FROM public.app_ratings r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE NOT EXISTS (SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id = r.user_id)
  ORDER BY r.created_at DESC;
$$;
