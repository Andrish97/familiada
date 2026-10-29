-- Wąż: ile zdarzeń (bez testów e2e) ma przypisane konto, ile z kont
-- wykluczonych ze statystyk i ile przeglądarek grało raz z kontem, raz bez.
SELECT count(*) FILTER (WHERE user_id IS NOT NULL) AS z_kontem,
       count(*) FILTER (WHERE user_id IS NULL) AS bez_konta,
       count(*) FILTER (WHERE user_id IN (SELECT user_id FROM public.stats_exclusions_effective)) AS z_konta_wykluczonego,
       count(DISTINCT user_id) AS konta,
       count(DISTINCT visitor) AS przegladarki,
       count(DISTINCT visitor) FILTER (WHERE user_id IS NULL AND visitor IN (SELECT visitor FROM public.snake_events WHERE user_id IS NOT NULL)) AS przegladarki_mieszane,
       count(DISTINCT visitor) FILTER (WHERE user_id IS NULL AND visitor IN (SELECT visitor FROM public.snake_events WHERE user_id IN (SELECT user_id FROM public.stats_exclusions_effective))) AS przegladarki_wykluczonych_bez_konta,
       (SELECT count(*) FROM public.snake_progress) AS postep_kont,
       max(created_at) AS ostatnie
FROM public.snake_events
WHERE visitor NOT LIKE 'e2e-%'
