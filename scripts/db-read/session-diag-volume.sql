-- Etap 0 planu diagnostyki per sesja (docs/diagnostyka-sesji-plan.md):
-- objętość logów Control 2 z ostatnich 30 dni, tylko liczby.
WITH s AS (
  SELECT id, game_id, started_at,
         coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(stats_detail->'events')='array' THEN stats_detail->'events' END),0) AS control_events
  FROM public.game_sessions
  WHERE control_version = 2 AND started_at > now() - interval '30 days'
), d AS (
  SELECT session_id, count(*) AS device_events
  FROM public.control2_device_events
  WHERE session_id IS NOT NULL
  GROUP BY session_id
), j AS (
  SELECT s.*, coalesce(d.device_events,0) AS device_events
  FROM s LEFT JOIN d ON d.session_id = s.id
), g AS (
  SELECT game_id, count(*) AS n FROM public.control2_device_events GROUP BY game_id
)
SELECT
  (SELECT count(*) FROM j) AS sesje_30d,
  (SELECT count(DISTINCT game_id) FROM j) AS gry_30d,
  (SELECT count(*) FROM j WHERE started_at > now() - interval '7 days') AS sesje_7d,
  (SELECT round(avg(control_events),1) FROM j) AS control_sr,
  (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY control_events) FROM j) AS control_p95,
  (SELECT max(control_events) FROM j) AS control_max,
  (SELECT count(*) FROM j WHERE control_events >= 95) AS control_na_limicie,
  (SELECT round(avg(device_events),1) FROM j) AS urz_sr,
  (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY device_events) FROM j) AS urz_p95,
  (SELECT max(device_events) FROM j) AS urz_max,
  (SELECT count(*) FROM j WHERE device_events = 0) AS urz_brak,
  (SELECT count(*) FROM g WHERE n >= 490) AS gry_na_limicie_500,
  (SELECT count(*) FROM public.control2_device_events) AS urz_wiersze,
  (SELECT round(avg(octet_length(details::text))) FROM public.control2_device_events) AS urz_bajty_sr,
  (SELECT min(created_at) FROM public.control2_device_events) AS urz_najstarsze
