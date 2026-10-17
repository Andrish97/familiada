-- Record sparse device lease transitions in the existing internal Admin log.
-- Heartbeats are intentionally not logged.
ALTER TABLE public.control2_device_events
  DROP CONSTRAINT control2_device_events_device_type_check,
  DROP CONSTRAINT control2_device_events_event_type_check;
ALTER TABLE public.control2_device_events
  ADD CONSTRAINT control2_device_events_device_type_check
    CHECK (device_type IN ('display','host','buzzer')),
  ADD CONSTRAINT control2_device_events_event_type_check
    CHECK (event_type IN ('page_state','render_stall','runtime_error','network_state','lease_state'));

CREATE OR REPLACE FUNCTION public._control2_log_device_lease_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_from text;
  v_epoch bigint;
  v_event_id text;
BEGIN
  IF TG_OP='INSERT' THEN
    -- Only log a queue insertion if another live instance already owns the slot.
    IF NEW.state<>'waiting' OR NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id=NEW.session_id AND s.device_type=NEW.device_type
        AND s.primary_connection_id IS NOT NULL AND s.primary_connection_id<>NEW.id
    ) THEN RETURN NEW; END IF;
    v_from := NULL;
    v_epoch := 0;
    v_event_id := 'lease:'||NEW.id::text||':waiting';
  ELSE
    IF OLD.state IS NOT DISTINCT FROM NEW.state THEN RETURN NEW; END IF;
    v_from := OLD.state;
    v_epoch := coalesce(NEW.epoch,OLD.epoch,0);
    v_event_id := 'lease:'||NEW.id::text||':'||NEW.state||':'||v_epoch::text;
  END IF;

  SELECT a.session_id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=NEW.game_id AND s.control_version=2 AND s.ended_at IS NULL
  LIMIT 1;
  IF v_session_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    INSERT INTO public.control2_device_events(
      game_id,session_id,device_type,event_type,event_id,details
    ) VALUES (
      NEW.game_id,v_session_id,NEW.device_type,'lease_state',v_event_id,
      jsonb_build_object(
        'device_type',NEW.device_type,
        'from_state',v_from,
        'to_state',NEW.state,
        'epoch',v_epoch,
        'connection_id',NEW.id,
        'visibility',NEW.page_visibility,
        'focused',NEW.focused
      )
    ) ON CONFLICT (game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;

    DELETE FROM public.control2_device_events e
    WHERE e.game_id=NEW.game_id
      AND (e.created_at<now()-interval '30 days' OR e.id IN (
        SELECT id FROM public.control2_device_events
        WHERE game_id=NEW.game_id ORDER BY created_at DESC,id DESC OFFSET 500
      ));
  EXCEPTION WHEN OTHERS THEN
    -- A diagnostic write must not break device registration or lease renewal.
    RAISE WARNING 'Control 2 lease event was not recorded: %',SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._control2_log_device_lease_transition() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER control_device_connections_log_lease_state
AFTER INSERT OR UPDATE OF state ON public.control_device_connections
FOR EACH ROW EXECUTE FUNCTION public._control2_log_device_lease_transition();

CREATE OR REPLACE FUNCTION public.get_control2_display_events(p_session_ids uuid[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(session_id::text,events),'{}'::jsonb)
  FROM (
    SELECT e.session_id,jsonb_agg(
      jsonb_build_object(
        'kind','diagnostic',
        'category',CASE WHEN e.event_type='lease_state' THEN 'device_lease' ELSE 'display_state' END,
        'at',e.created_at,
        'message',CASE
          WHEN e.event_type<>'lease_state' THEN 'Zdarzenie urządzenia Wyświetlacz.'
          WHEN e.details->>'to_state'='waiting' THEN 'Urządzenie oczekuje na zwolnienie blokady.'
          WHEN e.details->>'to_state'='primary' THEN 'Urządzenie zostało aktywowane jako główne.'
          WHEN e.details->>'to_state'='released' THEN 'Urządzenie zwolniło blokadę.'
          WHEN e.details->>'to_state'='expired' THEN 'Blokada urządzenia wygasła.'
          WHEN e.details->>'to_state'='revoked' THEN 'Połączenie urządzenia zostało cofnięte.'
          ELSE 'Zmienił się stan blokady urządzenia.' END,
        'devices',CASE WHEN e.event_type='lease_state'
          THEN jsonb_build_array(e.device_type) ELSE jsonb_build_array('display') END,
        'metrics',e.details||jsonb_build_object('reason',e.event_type)
      ) ORDER BY e.created_at,e.id
    ) AS events
    FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id=e.session_id AND s.control_version=2
    WHERE e.session_id=ANY(coalesce(p_session_ids,'{}'::uuid[]))
    GROUP BY e.session_id
  ) logs;
$$;
REVOKE ALL ON FUNCTION public.get_control2_display_events(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_control2_display_events(uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
