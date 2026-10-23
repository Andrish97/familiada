-- Audyt sprzątania (2026-10-23): czy da się czytać cron i statystyki funkcji,
-- liczba obiektów public, triggery bez funkcji public, rozszerzenia.
SELECT current_setting('track_functions') <> 'none' AS track_functions_wlaczone,
       to_regclass('cron.job') IS NOT NULL AS cron_jest,
       CASE WHEN to_regclass('cron.job') IS NULL THEN false ELSE has_table_privilege('cron.job', 'SELECT') END AS cron_do_odczytu,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS funkcje_public,
       (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p')) AS tabele_public,
       (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('v','m')) AS widoki_public,
       (SELECT count(*) FROM pg_extension) AS rozszerzenia,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relnamespace = 'auth'::regnamespace AND NOT t.tgisinternal) AS triggery_auth,
       pg_database_size(current_database()) AS rozmiar_bazy
