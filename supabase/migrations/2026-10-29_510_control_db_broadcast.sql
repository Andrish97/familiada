-- 510: jeden mechanizm powiadomień gry — baza wysyła zmiany na prywatne kanały.
--
-- Decyzja właściciela 2026-10-29 (pomiar e2e 40868645209: wysyłka z bazy
-- p50 141 ms / p90 158 ms, 0 zgubionych; obecne drogi ~420 ms): urządzenia
-- i Control dostają zmiany wyłącznie z bazy, bez dzwonków i bez
-- postgres_changes. Każdy zapis idzie do bazy, a baza w tej samej transakcji
-- wysyła wiersz:
--   game-state:<game_id>:<connection_id>  — każde aktualne główne urządzenie
--                                           (żywy lease, trwająca sesja);
--   game-control:<game_id>                — Control właściciela gry.
-- Zdarzenia: "state" (wiersz game_state, także naciśnięcie Przycisku)
-- i "completion" (wiersz game_state_display_completion — potwierdzenie
-- planszy dla Control i Przycisku).
-- Wyjątek: chwilowy sygnał Wyświetlacza „animacja rusza” (dźwięk z Control)
-- nie jest stanem — Wyświetlacz wysyła go wprost na game-signal:<game_id>
-- (zapis tylko Wyświetlacz z żywym lease, odczyt Control i Wyświetlacz).
-- Migracja dodająca: dotychczasowe drogi działają do sprzątania po
-- wdrożeniu kodu (strony otwarte przed wdrożeniem).

-- Wspólna wysyłka: wszystkie aktualne urządzenia gry + Control. Nigdy nie
-- przerywa zapisu.
CREATE OR REPLACE FUNCTION public._control_broadcast(p_game_id uuid, p_event text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target record;
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN; END IF;
  FOR v_target IN
    SELECT slot.primary_connection_id AS connection_id
    FROM public.control_runtime_sessions s
    JOIN public.control_device_slots slot ON slot.session_id = s.id
    WHERE s.game_id = p_game_id AND s.device_protocol = 2
      AND s.ended_at IS NULL AND s.expires_at > clock_timestamp()
      AND slot.game_id = p_game_id
      AND slot.primary_connection_id IS NOT NULL
      AND slot.lease_expires_at > clock_timestamp()
  LOOP
    BEGIN
      PERFORM realtime.send(p_payload, p_event, format('game-state:%s:%s', p_game_id, v_target.connection_id), true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'control broadcast (device) failed: %', SQLSTATE;
    END;
  END LOOP;
  BEGIN
    PERFORM realtime.send(p_payload, p_event, format('game-control:%s', p_game_id), true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'control broadcast (control) failed: %', SQLSTATE;
  END;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'control broadcast skipped: %', SQLSTATE;
END;
$$;

REVOKE ALL ON FUNCTION public._control_broadcast(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._game_state_broadcast_devices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._control_broadcast(NEW.game_id, 'state', jsonb_build_object('row', to_jsonb(NEW)));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._display_completion_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._control_broadcast(NEW.game_id, 'completion', jsonb_build_object('row', to_jsonb(NEW)));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._display_completion_broadcast() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS display_completion_broadcast ON public.game_state_display_completion;
CREATE TRIGGER display_completion_broadcast
  AFTER INSERT OR UPDATE ON public.game_state_display_completion
  FOR EACH ROW EXECUTE FUNCTION public._display_completion_broadcast();

-- Właściciel gry: game-control:<gid> i game-signal:<gid> (odczyt).
CREATE OR REPLACE FUNCTION public.control_owner_topic_valid(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_game uuid; v_uid uuid := auth.uid();
BEGIN
  IF p_topic IS NULL OR v_uid IS NULL THEN RETURN false; END IF;
  IF p_topic LIKE 'game-control:%' THEN v_game := substr(p_topic, 14)::uuid;
  ELSIF p_topic LIKE 'game-signal:%' THEN v_game := substr(p_topic, 13)::uuid;
  ELSE RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.games g WHERE g.id = v_game AND g.owner_id = v_uid);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.control_owner_topic_valid(text) IS
  'Realtime Authorization for game-control:<game_id> and game-signal:<game_id>: only the game owner (Control).';

REVOKE ALL ON FUNCTION public.control_owner_topic_valid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_owner_topic_valid(text) TO authenticated;

-- Wyświetlacz z żywym lease: game-signal:<gid> (odczyt potrzebny do
-- dołączenia, zapis sygnału „animacja rusza”).
CREATE OR REPLACE FUNCTION public.control_display_signal_topic_valid(p_topic text, p_claims jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_game uuid;
BEGIN
  IF p_topic IS NULL OR p_claims IS NULL OR p_claims ->> 'device_type' IS DISTINCT FROM 'display' THEN RETURN false; END IF;
  v_game := (p_claims ->> 'game_id')::uuid;
  IF p_topic <> format('game-signal:%s', v_game) THEN RETURN false; END IF;
  RETURN public.control_device_realtime_claim_valid(v_game, p_claims);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.control_display_signal_topic_valid(text, jsonb) IS
  'Realtime Authorization for game-signal:<game_id>: the Display JWT with the live primary lease of that game.';

REVOKE ALL ON FUNCTION public.control_display_signal_topic_valid(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_display_signal_topic_valid(text, jsonb) TO anon;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE '510: brak realtime.messages — polityki pominięte';
    RETURN;
  END IF;
  EXECUTE 'GRANT USAGE ON SCHEMA realtime TO authenticated';
  EXECUTE 'DROP POLICY IF EXISTS game_control_owner_read ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY game_control_owner_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (extension = 'broadcast' AND public.control_owner_topic_valid(realtime.topic()))
  $p$;
  EXECUTE 'DROP POLICY IF EXISTS game_signal_display_read ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY game_signal_display_read ON realtime.messages
    FOR SELECT TO anon
    USING (extension = 'broadcast' AND public.control_display_signal_topic_valid(realtime.topic(), auth.jwt()))
  $p$;
  EXECUTE 'DROP POLICY IF EXISTS game_signal_display_write ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY game_signal_display_write ON realtime.messages
    FOR INSERT TO anon
    WITH CHECK (extension = 'broadcast' AND public.control_display_signal_topic_valid(realtime.topic(), auth.jwt()))
  $p$;
  RAISE NOTICE '510: polityki game-control i game-signal utworzone';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '510: polityki na realtime.messages nieutworzone: % %', SQLSTATE, SQLERRM;
END $$;
