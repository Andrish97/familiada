-- Control 2: nadrabianie Wyświetlacza z heartbeatu per godzina (2026-10-24),
-- gry poza kontami e2e. Tylko liczby.
SELECT date_trunc('hour', e.created_at AT TIME ZONE 'Europe/Warsaw') AS godzina,
  count(DISTINCT e.game_session_id) FILTER (WHERE e.details->>'phase' = 'connected') AS sesje,
  count(DISTINCT e.game_id) AS gry,
  count(*) FILTER (WHERE e.details->>'phase' = 'fallback_catchup') AS nadrabianie,
  count(*) FILTER (WHERE e.details->>'phase' = 'recovered') AS odzyskane,
  count(*) FILTER (WHERE e.kind = 'disconnect') AS rozlaczenia
FROM public.control2_session_events e
WHERE e.source = 'display'
  AND e.created_at > timestamptz '2026-10-22 00:00+02'
GROUP BY 1 ORDER BY 1
