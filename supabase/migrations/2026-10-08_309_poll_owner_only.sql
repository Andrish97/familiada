-- Migration 309: uruchamianie / zamykanie ankiety tylko przez właściciela gry.
--
-- Luka (docs/ankiety-refaktor.md, sekcja 4a): poll_open,
-- poll_points_close_and_normalize i poll_text_close_apply sprawdzały tylko
-- klucz ankiety (share_key_poll) — ten sam, który jest w linku do
-- głosowania — i były dostępne publicznie. Każdy z linkiem mógł uruchomić
-- ankietę ponownie (skasować głosy) albo ją zamknąć.
--
-- Bez kopiowania ciał funkcji: oryginały dostają nazwy wewnętrzne bez
-- dostępu z API, a pod starymi nazwami (te same sygnatury — strona ankiety
-- działa bez zmian) są cienkie nakładki: zalogowany właściciel gry → wywołanie
-- oryginału; każdy inny → wyjątek. Nieużywane poll_close_and_normalize
-- (stara wersja zamykania) traci dostęp z API.
BEGIN;

ALTER FUNCTION public.poll_open(uuid, text) RENAME TO _poll_open_unchecked;
ALTER FUNCTION public.poll_points_close_and_normalize(uuid, text) RENAME TO _poll_points_close_unchecked;
ALTER FUNCTION public.poll_text_close_apply(uuid, text, jsonb) RENAME TO _poll_text_close_unchecked;

REVOKE ALL ON FUNCTION public._poll_open_unchecked(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._poll_points_close_unchecked(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._poll_text_close_unchecked(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poll_close_and_normalize(uuid, text) FROM PUBLIC, anon, authenticated;

-- Wspólne sprawdzenie: zalogowany użytkownik jest właścicielem gry.
CREATE FUNCTION public._poll_assert_owner(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._poll_assert_owner(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.poll_open(p_game_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  PERFORM public._poll_open_unchecked(p_game_id, p_key);
END $$;

CREATE FUNCTION public.poll_points_close_and_normalize(p_game_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  PERFORM public._poll_points_close_unchecked(p_game_id, p_key);
END $$;

CREATE FUNCTION public.poll_text_close_apply(p_game_id uuid, p_key text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  PERFORM public._poll_text_close_unchecked(p_game_id, p_key, p_payload);
END $$;

REVOKE ALL ON FUNCTION public.poll_open(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_points_close_and_normalize(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_text_close_apply(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_open(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_points_close_and_normalize(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_text_close_apply(uuid, text, jsonb) TO authenticated;

COMMIT;
