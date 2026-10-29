-- Control 2: skąd nadrabianie z heartbeatu (2026-10-24). Od 23.10, per dzień
-- i urządzenie: gry kont e2e vs pozostałe, liczba pominiętych rewizji. Tylko liczby.
SELECT (e.created_at AT TIME ZONE 'Europe/Warsaw')::date AS dzien,
  e.source = 'display' AS wysw, e.source = 'host' AS prow,
  (i.user_id IS NOT NULL) AS e2e,
  count(DISTINCT e.game_session_id) FILTER (WHERE e.details->>'phase' = 'connected') AS sesje,
  count(*) FILTER (WHERE e.details->>'phase' = 'connected'
    AND e.details->>'transport' = 'postgres_changes') AS polaczone_pc,
  count(*) FILTER (WHERE e.details->>'phase' = 'fallback_catchup') AS nadrabianie,
  count(DISTINCT e.game_session_id) FILTER (WHERE e.details->>'phase' = 'fallback_catchup') AS sesje_nadr,
  count(*) FILTER (WHERE e.details->>'phase' = 'fallback_catchup'
    AND (e.details->>'missed_revisions')::int = 1) AS nadr_1rev,
  max((e.details->>'missed_revisions')::int) FILTER (WHERE e.details->>'phase' = 'fallback_catchup') AS nadr_max
FROM public.control2_session_events e
JOIN public.games g ON g.id = e.game_id
LEFT JOIN public.e2e_identities i ON i.user_id = g.owner_id
WHERE e.source IN ('display','host','buzzer')
  AND e.created_at > timestamptz '2026-10-23 00:00+02'
GROUP BY 1, 2, 3, 4 ORDER BY 1, 4, 2, 3
