-- Kontrola roli odczytów: kim jest połączenie i czego nie może (bool).
SELECT current_user = 'agent_reader' AS rola_agent_reader,
       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuzytkownik,
       has_schema_privilege('auth', 'USAGE') AS dostep_auth,
       has_table_privilege('public.profiles', 'SELECT') AS dostep_profiles,
       has_table_privilege('public.games', 'UPDATE') AS zapis_games,
       current_setting('transaction_read_only') = 'on' AS tylko_odczyt
