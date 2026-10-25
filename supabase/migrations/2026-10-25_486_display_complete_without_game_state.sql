-- 486: potwierdzenie Wyświetlacza bez zmiany wiersza game_state (badanie
-- Control na słabym łączu, 25.10). Na akcję z dźwiękiem wiersz game_state
-- zmieniał się dotąd dwa razy (zapis Control i to lustro), a każda zmiana
-- szła pełnym wierszem do wszystkich urządzeń i przez sprawdzanie RLS.
-- Przycisk (jedyny odbiorca) dostaje potwierdzenie z tabeli
-- game_state_display_completion; starsze karty odpytują co 500 ms.
-- Kolumna display_rendered_rev zostaje (nie jest już aktualizowana).

CREATE OR REPLACE FUNCTION "public"."game_state_display_complete"("p_game_id" "uuid", "p_key" "text", "p_rev" bigint, "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id FOR UPDATE;
  IF current_rev IS NULL OR p_rev IS NULL OR p_rev<0 OR p_rev>current_rev THEN
    RAISE EXCEPTION 'invalid revision';
  END IF;

  INSERT INTO public.game_state_display_completion(game_id,rendered_rev,rendered_at)
    VALUES(p_game_id,p_rev,clock_timestamp())
    ON CONFLICT(game_id) DO UPDATE
      SET rendered_at=CASE WHEN excluded.rendered_rev>game_state_display_completion.rendered_rev
            THEN excluded.rendered_at ELSE game_state_display_completion.rendered_at END,
          rendered_rev=greatest(game_state_display_completion.rendered_rev,excluded.rendered_rev);

  -- 486: bez lustra w game_state.display_rendered_rev. Każde potwierdzenie
  -- wysyłało cały wiersz game_state przez Realtime do Wyświetlacza,
  -- Prowadzącego i Przycisku; jedyny odbiorca (Przycisk) słucha teraz
  -- tabeli potwierdzeń (onDirectTables) i sprawdza gotowość RPC.
END $$;

COMMENT ON COLUMN public.game_state.display_rendered_rev IS 'Nieużywane od migracji 486 (potwierdzenie tylko w game_state_display_completion); do usunięcia przy sprzątaniu.';
