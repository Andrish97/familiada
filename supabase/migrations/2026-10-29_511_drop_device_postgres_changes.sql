-- 511: sprzątanie po przejściu na kanały z bazy (508–510).
--
-- Decyzja właściciela 2026-10-29: jeden mechanizm, bez zapasowych dróg.
-- Urządzenia i Control dostają zmiany wyłącznie z prywatnych kanałów
-- (realtime.send z wyzwalaczy), więc znikają:
--   * polityki odczytu dla tokenu urządzenia przez postgres_changes
--     (game_state_device_realtime_read, display_completion_device_realtime_read),
--   * tabele stanu gry w publikacji supabase_realtime (nikt już nie
--     subskrybuje postgres_changes — mniej pracy serwera Realtime).
-- Odczyt właściciela (Control, REST) i RPC urządzeń zostają bez zmian.

DROP POLICY IF EXISTS game_state_device_realtime_read ON public.game_state;
DROP POLICY IF EXISTS display_completion_device_realtime_read ON public.game_state_display_completion;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public' AND tablename = 'game_state') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.game_state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public' AND tablename = 'game_state_display_completion') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.game_state_display_completion';
  END IF;
  RAISE NOTICE '511: postgres_changes dla stanu gry wyłączone';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '511: publikacja supabase_realtime bez zmian: % %', SQLSTATE, SQLERRM;
END $$;
