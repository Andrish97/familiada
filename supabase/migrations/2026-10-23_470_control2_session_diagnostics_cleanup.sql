-- 470: usunięcie starych mechanizmów diagnostyki Control 2
-- (docs/diagnostyka-sesji-plan.md, etap 4). Front od etapu 2 pisze przez
-- control2_device_log / control2_control_log, panel czyta z
-- control2_session_events (468). Dane starej tabeli i stats_detail.events
-- przeniesiono w 468.

-- Zmiany blokad urządzeń: wprost do zdarzeń sesji, także przed startem gry
-- (sesja uruchomienia = control_device_connections.session_id).
CREATE OR REPLACE FUNCTION public._control2_log_device_lease_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_from text;
  v_epoch bigint;
  v_event_id text;
  v_game_rev bigint;
  v_details jsonb;
  v_view jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'waiting' OR NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id = NEW.session_id AND s.device_type = NEW.device_type
        AND s.primary_connection_id IS NOT NULL AND s.primary_connection_id <> NEW.id
    ) THEN RETURN NEW; END IF;
    v_from := NULL;
    v_epoch := 0;
    v_event_id := 'lease:' || NEW.id::text || ':waiting';
  ELSE
    IF OLD.state IS NOT DISTINCT FROM NEW.state THEN RETURN NEW; END IF;
    v_from := OLD.state;
    v_epoch := coalesce(NEW.epoch, OLD.epoch, 0);
    v_event_id := 'lease:' || NEW.id::text || ':' || NEW.state || ':' || v_epoch::text;
  END IF;

  BEGIN
    SELECT rev INTO v_game_rev FROM public.game_state WHERE game_id = NEW.game_id;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'device_type', NEW.device_type,
      'from_state', v_from,
      'to_state', NEW.state,
      'epoch', v_epoch,
      'connection_id', NEW.id,
      'visibility', NEW.page_visibility,
      'focused', NEW.focused,
      'received_revision', NEW.received_rev,
      'rendered_revision', NEW.rendered_rev,
      'started_sound_cue_seq', NEW.started_sound_cue_seq,
      'game_revision', v_game_rev,
      'last_seen_age_ms', least(3600000, greatest(0,
        extract(epoch FROM clock_timestamp() - NEW.last_seen_at) * 1000))::integer
    ));
    v_view := public._control2_device_event_view(NEW.device_type, 'lease_state', v_details);
    PERFORM public._control2_session_event_add(
      public._control2_active_game_session(NEW.game_id), NEW.session_id, NEW.game_id, NEW.device_type, NEW.id,
      'diagnostic', v_view->>'category', 'lease_state', v_view->>'message',
      jsonb_build_array(NEW.device_type), v_view->'metrics', v_event_id, now());
  EXCEPTION WHEN OTHERS THEN
    -- Diagnostyka nie może przerwać rejestracji ani odnowienia lease.
    RAISE WARNING 'Control 2 lease event was not recorded: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._control2_log_device_lease_transition() FROM PUBLIC, anon, authenticated, service_role;

-- Stare RPC zapisu i odczytu.
DROP TRIGGER IF EXISTS control2_device_events_forward ON public.control2_device_events;
DROP FUNCTION IF EXISTS public._control2_device_events_forward();
DROP FUNCTION IF EXISTS public.control2_device_transport_event(uuid, text, text, jsonb, uuid, bigint);
DROP FUNCTION IF EXISTS public.control2_display_event(uuid, text, jsonb, uuid, bigint);
DROP FUNCTION IF EXISTS public.control2_display_event(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.control2_control_visibility_event(uuid, jsonb);
DROP FUNCTION IF EXISTS public.control2_network_probe_event(uuid, text, text, jsonb, uuid, bigint);
DROP FUNCTION IF EXISTS public.get_control2_display_events(uuid[]);
DROP TABLE IF EXISTS public.control2_device_events;

-- Sygnał aktywności sesji rozgrywki bez zdarzeń (zdarzenia: control2_control_log).
DROP FUNCTION IF EXISTS public.control2_session_ping(uuid, jsonb);
CREATE FUNCTION public.control2_session_ping(p_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.game_sessions s SET last_seen_at = now()
  FROM public.game_session_active a
  WHERE a.game_id = p_game_id AND s.id = a.session_id AND s.game_id = a.game_id
    AND s.control_version = 2 AND s.ended_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_session_ping(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control2_session_ping(uuid) TO authenticated;

-- Stara lista zdarzeń w wierszu sesji (przeniesiona w 468). Strażnik kopii
-- oczekujących na przyjęcie nie dotyczy tej zmiany technicznej.
ALTER TABLE public.game_sessions DISABLE TRIGGER copy_pending_game_sessions;
UPDATE public.game_sessions SET stats_detail = stats_detail - 'events' WHERE stats_detail ? 'events';
ALTER TABLE public.game_sessions ENABLE TRIGGER copy_pending_game_sessions;

NOTIFY pgrst, 'reload schema';
