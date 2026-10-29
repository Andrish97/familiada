-- 517: konto testowe wykluczone ze statystyk i list panelu admina od chwili
-- założenia. Dotąd widok rozpoznawał tożsamość e2e tylko po
-- e2e_identities.user_id: konto disposable usunięte w teście i założone
-- ponownie formularzem (ten sam adres e2e+<rola><NN>@familijna.app) do
-- następnego wypożyczenia wyglądało w panelu jak zwykły użytkownik.
-- Teraz także po adresie tożsamości (i jej adresie .new@ ze zmiany e-maila,
-- jak profiles_reserve_test_username). Kolumny widoku bez zmian.
CREATE OR REPLACE VIEW public.stats_exclusions_effective AS
 SELECT DISTINCT ON (user_id) user_id, added_at, reason
   FROM ( SELECT stats_excluded_users.user_id,
            stats_excluded_users.added_at,
            'manual'::text AS reason,
            2 AS priority
           FROM public.stats_excluded_users
        UNION ALL
         SELECT p.id,
            p.created_at,
                CASE
                    WHEN COALESCE(u.raw_app_meta_data ->> 'is_test_guest', 'false') = 'true' THEN 'test_guest'::text
                    WHEN i.role IS NOT NULL THEN 'test:' || i.role
                    ELSE 'test:' || (u.raw_app_meta_data ->> 'e2e_role')
                END AS "case",
            1
           FROM public.profiles p
             JOIN auth.users u ON u.id = p.id
             LEFT JOIN LATERAL (
               SELECT ei.role FROM public.e2e_identities ei
                WHERE ei.user_id = u.id
                   OR (ei.email IS NOT NULL AND lower(u.email) IN (ei.email, replace(ei.email, '@', '.new@')))
                ORDER BY (ei.user_id = u.id) DESC NULLS LAST
                LIMIT 1) i ON true
          WHERE COALESCE(u.raw_app_meta_data ->> 'is_test_guest', 'false') = 'true'
             OR (u.raw_app_meta_data ->> 'e2e_role') IS NOT NULL
             OR i.role IS NOT NULL) x
  ORDER BY user_id, priority;
