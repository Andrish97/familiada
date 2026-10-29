-- Bezpieczeństwo (audyt E24, 2026-10-21): funkcje SECURITY DEFINER bez
-- sprawdzania użytkownika, wykonywalne na produkcji przez anon
-- i authenticated (domyślne EXECUTE dla PUBLIC). Bez logowania dało się m.in.
-- usunąć dane dowolnego konta (delete_user_everything), listować pliki
-- w Storage, zmieniać harmonogram poczty, limity dostawców, kolejkę leadów.
-- Wołają je tylko: klucz serwisowy (Worker, funkcje Edge, lead-finder),
-- cron i inne funkcje SECURITY DEFINER (prawa właściciela) -- żadna nie jest
-- wołana z przeglądarki ani z funkcji SECURITY INVOKER / polityk RLS.
-- Zostaje service_role.

DO $$
DECLARE
  fn record;
  n int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public' AND p.proname IN (
      'auth_clear_email_change', 'claim_next_pending_lead', 'cleanup_trash', 'decrement_provider_immediate',
      'decrement_provider_worker', 'delete_user_everything', 'get_available_ai_providers', 'get_trash_attachments',
      'invoke_mail_worker', 'invoke_mail_worker_ids', 'mail_cron_set', 'mail_cron_status', 'save_attachment',
      'set_ai_provider_cooldown', 'mail_cooldown_email_release', 'reset_email_limits', 'storage_list_objects',
      'guest_cleanup_expired', 'market_cleanup_rejected', 'invoke_embed_missing_market_games', 'rpc_example',
      'seed_demo_for_user', 'generate_ticket_number', 'touch_game_updated_at', '_ensure_unsub_token')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
  END LOOP;
  IF n < 20 THEN
    RAISE EXCEPTION 'internal_functions_service_only: oczekiwano co najmniej 20 funkcji, jest %', n;
  END IF;
END $$;
