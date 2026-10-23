-- Control 2: czy postgres_changes dostarcza zmiany urządzeniom (2026-10-23).
-- Per dzień: sesje, dołączenia kanału bezpośredniego i nadrabianie stanu
-- z heartbeatu lease (kanał SUBSCRIBED, ale zmiana nie przyszła). Tylko liczby.
SELECT (e.created_at AT TIME ZONE 'Europe/Warsaw')::date AS dzien,
  count(DISTINCT e.game_session_id) AS sesje,
  count(*) FILTER (WHERE e.details->>'phase' = 'connected'
    AND e.details->>'transport' = 'postgres_changes') AS polaczone_pc,
  count(*) FILTER (WHERE e.details->>'phase' = 'fallback_catchup') AS nadrabianie,
  count(DISTINCT e.game_session_id) FILTER (WHERE e.details->>'phase' = 'fallback_catchup') AS sesje_z_nadrabianiem,
  count(*) FILTER (WHERE e.details->>'phase' = 'recovered') AS odzyskane
FROM public.control2_session_events e
WHERE e.source IN ('display','host','buzzer')
  AND e.created_at > now() - interval '14 days'
GROUP BY 1 ORDER BY 1
