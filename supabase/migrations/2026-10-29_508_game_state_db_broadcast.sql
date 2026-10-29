-- 508: stan gry wysyłany z bazy na prywatny kanał urządzenia (Broadcast from Database).
--
-- Pomiar 29.10 (tests/e2e/realtime-paths-benchmark.spec.js): postgres_changes
-- (odpytywanie slotu co 100 ms + RLS przy każdej zmianie i każdym urządzeniu)
-- dostarcza zmianę w ~410 ms (p90 600), dzwonek z odczytem ~380 ms, a na
-- słabym łączu dzwonek traci cały dodatkowy odczyt. Tu baza w tej samej
-- transakcji co zapis wysyła cały wiersz (realtime.send → strumień pgoutput,
-- bez odpytywania) na kanał każdego AKTUALNEGO głównego urządzenia gry:
--   game-state:<game_id>:<connection_id>
-- Odbiorcami są tylko połączenia, które w chwili zapisu mają żywy lease
-- w trwającej sesji — urządzenie zastąpione, wygasłe albo z zakończonej sesji
-- nie dostaje kolejnych zmian (unieważnianie przy każdej zmianie, jak RLS
-- postgres_changes). Dołączenie do kanału sprawdza polityka na
-- realtime.messages: token urządzenia (claims z device-realtime-token) musi
-- pasować do tematu i do żywego lease.
-- Migracja dodająca: aplikacja jeszcze tego kanału nie słucha (najpierw pomiar).
-- Błąd wysyłki nigdy nie przerywa zapisu stanu gry.

CREATE OR REPLACE FUNCTION public._game_state_broadcast_devices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target record;
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN NULL;
  END IF;
  FOR v_target IN
    SELECT slot.primary_connection_id AS connection_id
    FROM public.control_runtime_sessions s
    JOIN public.control_device_slots slot ON slot.session_id = s.id
    WHERE s.game_id = NEW.game_id AND s.device_protocol = 2
      AND s.ended_at IS NULL AND s.expires_at > clock_timestamp()
      AND slot.game_id = NEW.game_id
      AND slot.primary_connection_id IS NOT NULL
      AND slot.lease_expires_at > clock_timestamp()
  LOOP
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('row', to_jsonb(NEW)),
        'state',
        format('game-state:%s:%s', NEW.game_id, v_target.connection_id),
        true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'game_state broadcast failed: %', SQLSTATE;
    END;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'game_state broadcast skipped: %', SQLSTATE;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public._game_state_broadcast_devices() IS
  'Sends each game_state change to the private Realtime topic of every current primary device connection (game-state:<game_id>:<connection_id>). Never fails the write.';

DROP TRIGGER IF EXISTS game_state_broadcast_devices ON public.game_state;
CREATE TRIGGER game_state_broadcast_devices
  AFTER INSERT OR UPDATE ON public.game_state
  FOR EACH ROW EXECUTE FUNCTION public._game_state_broadcast_devices();

REVOKE ALL ON FUNCTION public._game_state_broadcast_devices() FROM PUBLIC, anon, authenticated;

-- Odbiór prywatnego kanału: token urządzenia, temat jego własnego połączenia,
-- żywy lease (ta sama funkcja co dla postgres_changes). Niepoprawny token
-- daje brak dostępu, nie błąd.
CREATE OR REPLACE FUNCTION public.control_device_broadcast_topic_valid(p_topic text, p_claims jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_game uuid;
BEGIN
  IF p_topic IS NULL OR p_claims IS NULL THEN RETURN false; END IF;
  v_game := (p_claims ->> 'game_id')::uuid;
  IF p_topic <> format('game-state:%s:%s', v_game, (p_claims ->> 'connection_id')::uuid) THEN
    RETURN false;
  END IF;
  RETURN public.control_device_realtime_claim_valid(v_game, p_claims);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.control_device_broadcast_topic_valid(text, jsonb) IS
  'Realtime Authorization for game-state:<game_id>:<connection_id>: the device JWT must name this exact connection and hold the live primary lease.';

REVOKE ALL ON FUNCTION public.control_device_broadcast_topic_valid(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_device_broadcast_topic_valid(text, jsonb) TO anon;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE '508: brak realtime.messages — polityka pominięta';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS game_state_device_broadcast_read ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY game_state_device_broadcast_read ON realtime.messages
    FOR SELECT TO anon
    USING (
      extension = 'broadcast'
      AND public.control_device_broadcast_topic_valid(realtime.topic(), auth.jwt())
    )
  $p$;
  RAISE NOTICE '508: polityka game_state_device_broadcast_read utworzona';
EXCEPTION WHEN OTHERS THEN
  -- Bez polityki nikt nie dołączy do kanału (bezpieczne); log pokaże przyczynę.
  RAISE WARNING '508: polityka na realtime.messages nieutworzona: % %', SQLSTATE, SQLERRM;
END $$;
