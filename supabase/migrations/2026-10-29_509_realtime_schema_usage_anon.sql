-- 509: dostęp roli anon do schematu realtime (autoryzacja kanałów prywatnych).
--
-- Pomiar po 508 (e2e 40866600957): każde dołączenie urządzenia do
-- game-state:<game_id>:<connection_id> kończyło się RlsPolicyError
-- (aclcheck_error) → „Unauthorized”. Serwer Realtime sprawdza polityki na
-- realtime.messages jako anon, a anon nie miał USAGE na schemacie realtime
-- (realtime.topic() i tabela messages niedostępne). Standardowa instalacja
-- Supabase nadaje ten dostęp; tu go brakowało.
-- Nic nie otwiera się na zewnątrz: REST nie wystawia schematu realtime,
-- zapis do realtime.messages nie ma polityki (RLS odrzuca), odczyt pilnuje
-- wyłącznie game_state_device_broadcast_read (508).
DO $$
BEGIN
  IF to_regnamespace('realtime') IS NULL THEN
    RAISE NOTICE '509: brak schematu realtime — pominięte';
    RETURN;
  END IF;
  EXECUTE 'GRANT USAGE ON SCHEMA realtime TO anon';
  RAISE NOTICE '509: anon ma USAGE na schemacie realtime';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '509: GRANT USAGE realtime nieudany: % %', SQLSTATE, SQLERRM;
END $$;
