-- Wycofane transakcje (badanie 2026-10-25): czy serwer ma statystyki zapytań
-- i funkcji, liczniki bazy, aktywne gry Control i otwarte sesje runtime
-- (wycofania rosną z odpytywaniem, gdy funkcje RPC rzucają wyjątki).
SELECT (SELECT count(*) FROM pg_extension WHERE extname = 'pg_stat_statements') AS pg_stat_statements,
       current_setting('track_functions') <> 'none' AS track_functions,
       d.xact_rollback AS wycofane, d.xact_commit AS zatwierdzone,
       round(100.0 * d.xact_rollback / nullif(d.xact_rollback + d.xact_commit, 0), 2) AS procent_wycofanych,
       extract(epoch FROM now() - pg_postmaster_start_time())::bigint AS sekundy_od_startu,
       (SELECT count(*) FROM public.control_runtime_sessions WHERE ended_at IS NULL AND expires_at > now()) AS sesje_control,
       (SELECT count(*) FROM public.control_device_connections WHERE last_seen_at > now() - interval '1 minute') AS polaczenia_urzadzen_1min,
       now() AS teraz
FROM pg_stat_database d
WHERE d.datname = current_database()
