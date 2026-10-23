-- Stan serwera bazy (liczby i daty): restart Postgresa, połączenia, długie
-- zapytania, czekanie na blokady, zakleszczenia i pliki tymczasowe od startu.
SELECT pg_postmaster_start_time() AS start_postgres,
       now() AS teraz,
       current_setting('max_connections')::int AS max_polaczen,
       (SELECT count(*) FROM pg_stat_activity) AS polaczenia,
       (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS aktywne,
       (SELECT count(*) FROM pg_stat_activity WHERE state LIKE 'idle in transaction%') AS bezczynne_w_transakcji,
       (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock') AS czekaja_na_blokade,
       (SELECT coalesce(max(extract(epoch FROM now() - query_start)), 0)::int FROM pg_stat_activity WHERE state = 'active' AND backend_type = 'client backend') AS najdluzsze_zapytanie_s,
       (SELECT coalesce(max(extract(epoch FROM now() - xact_start)), 0)::int FROM pg_stat_activity WHERE xact_start IS NOT NULL AND backend_type = 'client backend') AS najdluzsza_transakcja_s,
       (SELECT sum(deadlocks) FROM pg_stat_database) AS zakleszczenia,
       (SELECT sum(temp_bytes) FROM pg_stat_database) AS temp_bajty,
       (SELECT sum(xact_rollback) FROM pg_stat_database WHERE datname = current_database()) AS wycofane,
       (SELECT sum(xact_commit) FROM pg_stat_database WHERE datname = current_database()) AS zatwierdzone,
       (SELECT pg_database_size('_supabase')) AS baza_logow_bajty
