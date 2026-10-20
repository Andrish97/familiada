-- Kto jest teraz na stronie (liczby): aktywne karty i użytkownicy w ostatnich
-- 2 minutach, widoczne karty, gry w Control z niewygasłą sesją.
SELECT count(DISTINCT user_id) FILTER (WHERE last_seen_at > now() - interval '2 minutes') AS uzytkownicy_2min,
       count(*) FILTER (WHERE last_seen_at > now() - interval '2 minutes') AS karty_2min,
       count(*) FILTER (WHERE last_seen_at > now() - interval '2 minutes' AND visible) AS karty_widoczne_2min,
       count(DISTINCT user_id) FILTER (WHERE last_seen_at > now() - interval '15 minutes') AS uzytkownicy_15min,
       (SELECT count(DISTINCT game_id) FROM public.control_runtime_sessions
         WHERE ended_at IS NULL AND expires_at > now()) AS gry_control_aktywne,
       now() AS teraz
FROM public.site_activity
