-- 513: zdarzenia urządzeń z chwili startu gry nie giną.
--
-- Zdarzenie zapisane, zanim powstanie sesja gry, czeka bez game_session_id
-- i jest dopinane przez wyzwalacz game_sessions_diag_start. Gdy zapis zdarzenia
-- i utworzenie sesji szły równolegle, zapis nie widział jeszcze sesji, a
-- dopinanie nie widziało jeszcze zdarzenia — wpis zostawał na zawsze bez gry
-- (kontrola produkcji 40887197226: brak „połączony” Prowadzącego; po przejściu
-- na kanały z bazy urządzenia reagują na start w ~140 ms, więc to częstsze).
-- Obie strony biorą tę samą krótką blokadę na sesję Control (runtime), a
-- zdarzenie po blokadzie jeszcze raz szuka trwającej sesji gry.

CREATE OR REPLACE FUNCTION public._control2_session_event_add(
  p_game_session_id uuid, p_runtime_session_id uuid, p_game_id uuid, p_source text,
  p_connection_id uuid, p_kind text, p_category text, p_event_type text, p_message text,
  p_devices jsonb, p_details jsonb, p_event_id text, p_at timestamp with time zone DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_count integer;
  v_id bigint;
  v_game_session uuid := p_game_session_id;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_key text := public._control2_diag_key(p_kind, p_category, p_event_type, coalesce(p_details, '{}'::jsonb));
BEGIN
  IF v_game_session IS NULL AND p_runtime_session_id IS NULL THEN RETURN false; END IF;
  IF v_game_session IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('control2-diag:' || p_runtime_session_id::text, 0));
    SELECT s.id INTO v_game_session FROM public.game_sessions s
    WHERE s.runtime_session_id = p_runtime_session_id AND s.control_version = 2 AND s.ended_at IS NULL
    ORDER BY s.started_at DESC LIMIT 1;
  END IF;
  IF v_game_session IS NOT NULL THEN
    SELECT event_count INTO v_count FROM public.control2_session_diag WHERE game_session_id = v_game_session;
  ELSE
    SELECT count(*) INTO v_count FROM (
      SELECT 1 FROM public.control2_session_events
      WHERE runtime_session_id = p_runtime_session_id AND game_session_id IS NULL LIMIT 3000
    ) x;
  END IF;
  IF coalesce(v_count, 0) >= 3000 THEN
    IF v_game_session IS NOT NULL THEN
      PERFORM public._control2_diag_bump(v_game_session, p_source, v_key, p_at, v_details, true);
    END IF;
    RETURN false;
  END IF;
  INSERT INTO public.control2_session_events(
    game_session_id, runtime_session_id, game_id, source, connection_id, kind, category,
    event_type, message, devices, details, event_id, created_at
  ) VALUES (
    v_game_session, p_runtime_session_id, p_game_id, p_source, p_connection_id, p_kind, p_category,
    p_event_type, left(p_message, 1000),
    CASE WHEN jsonb_typeof(p_devices) = 'array' THEN p_devices ELSE '[]'::jsonb END,
    v_details, nullif(left(p_event_id, 80), ''), p_at
  ) ON CONFLICT (game_id, event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN false; END IF;
  IF v_game_session IS NOT NULL THEN
    PERFORM public._control2_diag_bump(v_game_session, p_source, v_key, p_at, v_details, false);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._control2_game_session_diag_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE e record;
BEGIN
  IF NEW.control_version <> 2 THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.control2_session_diag(game_session_id, runtime_session_id, game_id, started_at)
      VALUES (NEW.id, NEW.runtime_session_id, NEW.game_id, NEW.started_at)
      ON CONFLICT (game_session_id) DO UPDATE SET runtime_session_id = EXCLUDED.runtime_session_id,
        game_id = EXCLUDED.game_id, started_at = EXCLUDED.started_at;
    IF NEW.runtime_session_id IS NOT NULL THEN
      -- Ta sama blokada co przy zapisie zdarzenia bez sesji: zdarzenie zapisane
      -- równolegle albo zostanie tu dopięte, albo samo znajdzie tę sesję.
      PERFORM pg_advisory_xact_lock(hashtextextended('control2-diag:' || NEW.runtime_session_id::text, 0));
      FOR e IN UPDATE public.control2_session_events SET game_session_id = NEW.id
        WHERE runtime_session_id = NEW.runtime_session_id AND game_session_id IS NULL
        RETURNING source, kind, category, event_type, details, created_at
      LOOP
        PERFORM public._control2_diag_bump(NEW.id, e.source,
          public._control2_diag_key(e.kind, e.category, e.event_type, e.details), e.created_at, e.details, false);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Diagnostyka nie może cofnąć startu gry ani statystyk.
    RAISE WARNING 'Control 2 session diagnostics start failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._control2_session_event_add(uuid, uuid, uuid, text, uuid, text, text, text, text, jsonb, jsonb, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
