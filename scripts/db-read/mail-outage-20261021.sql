-- Awaria send-mail 2026-10-21 22:37–22:51 UTC (okno 1) i porównawcze pół godziny przed (okno 2) -- same liczby.
SELECT 1 AS okno, c.* FROM public.agent_mail_window_counts('2026-10-21 22:37:00+00', '2026-10-21 22:52:00+00') c
UNION ALL
SELECT 2 AS okno, c.* FROM public.agent_mail_window_counts('2026-10-21 22:00:00+00', '2026-10-21 22:37:00+00') c
