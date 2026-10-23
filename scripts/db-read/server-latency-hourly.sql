-- Opóźnienia serwera z pomiarów urządzeń w grach (network-probe.js, migracja
-- 466): na godzinę z 3 dni — liczba pomiarów, spowolnienia z werdyktem
-- „serwer” / „łącze urządzenia”, percentyle db_ms (pełne RPC do serwera)
-- i edge_ms (tylko do Cloudflare), błędy odczytu stanu i kanału.
SELECT date_trunc('hour', e.created_at) AS godzina,
       count(*) FILTER (WHERE e.event_type = 'network_state' AND e.details->>'source' = 'probe') AS pomiary,
       count(*) FILTER (WHERE e.details->>'phase' = 'slow' AND e.details->>'verdict' = 'server') AS wolny_serwer,
       count(*) FILTER (WHERE e.details->>'phase' = 'slow' AND e.details->>'verdict' = 'device_network') AS wolne_lacze,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.details->>'db_ms')::numeric) FILTER (WHERE e.details ? 'db_ms' AND e.details->>'db_ms' ~ '^[0-9.]+$') AS db_ms_p50,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY (e.details->>'db_ms')::numeric) FILTER (WHERE e.details ? 'db_ms' AND e.details->>'db_ms' ~ '^[0-9.]+$') AS db_ms_p90,
       max((e.details->>'max_db_ms')::numeric) FILTER (WHERE e.details->>'max_db_ms' ~ '^[0-9.]+$') AS db_ms_max,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.details->>'edge_ms')::numeric) FILTER (WHERE e.details ? 'edge_ms' AND e.details->>'edge_ms' ~ '^[0-9.]+$') AS edge_ms_p50,
       count(*) FILTER (WHERE e.details->>'db_failed' = 'true') AS db_nieudane,
       count(*) FILTER (WHERE e.event_type = 'state_sync' AND e.details->>'phase' = 'read_error') AS odczyt_stanu_blad,
       count(*) FILTER (WHERE e.event_type = 'transport_state' AND e.details->>'phase' = 'auth_error') AS kanal_blad,
       count(DISTINCT e.game_session_id) AS sesje
FROM public.control2_session_events e
WHERE e.created_at > now() - interval '3 days'
GROUP BY 1
ORDER BY 1
