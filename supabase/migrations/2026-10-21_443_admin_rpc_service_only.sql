-- Bezpieczeństwo (zgłoszenie 2026-10-21): funkcje panelu admina, poczty
-- kontaktowej, kolejki maili, konfiguracji i marketingu dało się wywołać
-- publicznym kluczem (domyślne EXECUTE dla PUBLIC) -- bez logowania można było
-- czytać wiadomości kontaktowe, adresy e-mail i zmieniać konfigurację.
-- Wołają je wyłącznie: Worker panelu admina (klucz serwisowy, za Cloudflare
-- Access) i funkcja mail-worker (klucz serwisowy). Odbieramy EXECUTE od PUBLIC,
-- anon i authenticated; zostaje service_role. Funkcje wołane jeszcze wprost
-- z przeglądarki panelu (statystyki, oceny, wykluczenia) -- osobna migracja
-- po przeniesieniu ich do Workera.

DO $$
DECLARE
  fn record;
  n int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public' AND p.proname IN (
      'admin_config_get', 'admin_config_set', 'admin_move_message', 'admin_update_contact_report',
      'assign_message_to_report', 'clear_marketing_search_logs', 'create_report', 'delete_message',
      'find_report_and_append_message', 'get_message', 'get_message_attachments', 'get_report_messages',
      'list_messages', 'list_reports', 'mail_queue_mark', 'mail_queue_pick', 'mail_queue_pick_selected',
      'mail_queue_requeue', 'mark_message_read', 'marketing_get_verified_contacts', 'restore_message',
      'save_form_message', 'save_inbound_message', 'save_outbound_message', 'set_report_status',
      'trash_message', 'truncate_marketing_queries_log', 'truncate_marketing_search_logs',
      'unassign_message_report')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
  END LOOP;
  IF n < 29 THEN
    RAISE EXCEPTION 'admin_rpc_service_only: oczekiwano co najmniej 29 funkcji, jest %', n;
  END IF;
END $$;
