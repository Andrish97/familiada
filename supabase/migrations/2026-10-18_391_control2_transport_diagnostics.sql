-- Record sparse, lease-scoped transport and recovery events from all Control 2
-- devices. No heartbeat stream or browser identifiers are stored.
ALTER TABLE public.control2_device_events
  DROP CONSTRAINT control2_device_events_event_type_check;
ALTER TABLE public.control2_device_events
  ADD CONSTRAINT control2_device_events_event_type_check
    CHECK (event_type IN (
      'page_state','render_stall','runtime_error','network_state','lease_state',
      'transport_state','state_sync'
    ));

CREATE OR REPLACE FUNCTION public.control2_device_transport_event(
  p_game_id uuid,
  p_device_type text,
  p_key text,
  p_event jsonb,
  p_connection_id uuid,
  p_epoch bigint
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_event_type text;
  v_phase text;
  v_transport text;
  v_status text;
  v_trigger text;
  v_details jsonb;
  v_event_id text;
  v_rev bigint;
  v_previous_rev bigint;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public._control_device_action_valid(
       p_game_id,p_device_type,p_key,p_connection_id,p_epoch
     ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_event IS NULL OR octet_length(p_event::text)>2000 THEN
    RAISE EXCEPTION 'invalid event';
  END IF;

  v_event_type := p_event->>'event_type';
  v_phase := p_event->>'phase';
  v_transport := p_event->>'transport';
  v_status := p_event->>'status';
  v_trigger := p_event->>'trigger';
  IF v_event_type NOT IN ('transport_state','state_sync')
     OR v_event_type IS NULL
     OR v_phase IS NULL
     OR v_phase NOT IN (
       'connected','disconnected','recovered','auth_error',
       'fallback_catchup','read_error','read_recovered','render_error','render_recovered'
     )
     OR v_transport IS NULL
     OR v_transport NOT IN ('postgres_changes','rpc_fallback') THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  IF (v_event_type='transport_state' AND v_phase IN ('fallback_catchup','read_error','read_recovered','render_error','render_recovered'))
     OR (v_event_type='state_sync' AND v_phase NOT IN ('fallback_catchup','read_error','read_recovered','render_error','render_recovered')) THEN
    RAISE EXCEPTION 'invalid event phase';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN (
    'SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED','TOKEN_ERROR','FETCH_ERROR'
  ) THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF v_trigger IS NOT NULL AND v_trigger NOT IN (
    'poll','broadcast','bootstrap','resume','channel_recovery','channel_failure',
    'delete_recovery','doorbell_ready','other'
  ) THEN RAISE EXCEPTION 'invalid trigger'; END IF;

  SELECT a.session_id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=p_game_id AND s.control_version=2 AND s.ended_at IS NULL;
  IF v_session_id IS NULL THEN RETURN false; END IF;

  IF coalesce(p_event->>'revision','') ~ '^[0-9]{1,18}$' THEN
    v_rev := (p_event->>'revision')::bigint;
  END IF;
  IF coalesce(p_event->>'previous_revision','') ~ '^[0-9]{1,18}$' THEN
    v_previous_rev := (p_event->>'previous_revision')::bigint;
  END IF;

  v_details := jsonb_build_object(
    'device_type',p_device_type,
    'phase',v_phase,
    'transport',v_transport,
    'status',v_status,
    'trigger',v_trigger,
    'revision',v_rev,
    'previous_revision',v_previous_rev,
    'rendered_revision',CASE
      WHEN coalesce(p_event->>'rendered_revision','') ~ '^[0-9]{1,18}$'
        THEN (p_event->>'rendered_revision')::bigint ELSE NULL END,
    'duration_ms',CASE
      WHEN jsonb_typeof(p_event->'duration_ms')='number'
        THEN least(3600000,greatest(0,(p_event->>'duration_ms')::numeric))::integer ELSE NULL END,
    'transition_count',CASE WHEN jsonb_typeof(p_event->'transition_count')='number'
      THEN least(1000,greatest(0,(p_event->>'transition_count')::numeric))::integer ELSE NULL END,
    'catchup_count',CASE WHEN jsonb_typeof(p_event->'catchup_count')='number'
      THEN least(10000,greatest(0,(p_event->>'catchup_count')::numeric))::integer ELSE NULL END,
    'missed_revisions',CASE WHEN jsonb_typeof(p_event->'missed_revisions')='number'
      THEN least(1000000,greatest(0,(p_event->>'missed_revisions')::numeric))::integer ELSE NULL END,
    'latest_revision',CASE WHEN coalesce(p_event->>'latest_revision','') ~ '^[0-9]{1,18}$'
      THEN (p_event->>'latest_revision')::bigint ELSE NULL END,
    'max_fetch_ms',CASE WHEN jsonb_typeof(p_event->'max_fetch_ms')='number'
      THEN least(60000,greatest(0,(p_event->>'max_fetch_ms')::numeric))::integer ELSE NULL END,
    'max_render_ms',CASE WHEN jsonb_typeof(p_event->'max_render_ms')='number'
      THEN least(60000,greatest(0,(p_event->>'max_render_ms')::numeric))::integer ELSE NULL END,
    'first_status',CASE WHEN p_event->>'first_status' IN ('CHANNEL_ERROR','TIMED_OUT','CLOSED','TOKEN_ERROR')
      THEN p_event->>'first_status' ELSE NULL END,
    'start_visibility',CASE WHEN p_event->>'start_visibility' IN ('visible','hidden')
      THEN p_event->>'start_visibility' ELSE 'unknown' END,
    'start_online',CASE WHEN jsonb_typeof(p_event->'start_online')='boolean'
      THEN (p_event->>'start_online')::boolean ELSE NULL END,
    'hidden_duration_ms',CASE WHEN jsonb_typeof(p_event->'hidden_duration_ms')='number'
      THEN least(86400000,greatest(0,(p_event->>'hidden_duration_ms')::numeric))::integer ELSE NULL END,
    'fetch_ms',CASE
      WHEN jsonb_typeof(p_event->'fetch_ms')='number'
        THEN least(60000,greatest(0,(p_event->>'fetch_ms')::numeric))::integer ELSE NULL END,
    'render_ms',CASE
      WHEN jsonb_typeof(p_event->'render_ms')='number'
        THEN least(60000,greatest(0,(p_event->>'render_ms')::numeric))::integer ELSE NULL END,
    'visibility',CASE WHEN p_event->>'visibility' IN ('visible','hidden')
      THEN p_event->>'visibility' ELSE 'unknown' END,
    'focused',CASE WHEN jsonb_typeof(p_event->'focused')='boolean'
      THEN (p_event->>'focused')::boolean ELSE NULL END,
    'online',CASE WHEN jsonb_typeof(p_event->'online')='boolean'
      THEN (p_event->>'online')::boolean ELSE NULL END,
    'was_discarded',CASE WHEN jsonb_typeof(p_event->'was_discarded')='boolean'
      THEN (p_event->>'was_discarded')::boolean ELSE NULL END,
    'error_class',CASE WHEN v_status IN ('TOKEN_ERROR','FETCH_ERROR')
        OR (v_event_type='state_sync' AND v_phase='render_error')
        OR (v_event_type='transport_state' AND p_event->>'error_class' IS NOT NULL)
      THEN left(coalesce(p_event->>'error_class','Error'),80) ELSE NULL END
  );

  v_event_id := left(coalesce(p_event->>'event_id',''),80);
  IF v_event_id='' THEN RAISE EXCEPTION 'event_id_required'; END IF;
  INSERT INTO public.control2_device_events(
    game_id,session_id,device_type,event_type,event_id,details
  ) VALUES (
    p_game_id,v_session_id,p_device_type,v_event_type,v_event_id,v_details
  ) ON CONFLICT (game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;

  DELETE FROM public.control2_device_events e
  WHERE e.game_id=p_game_id
    AND (e.created_at<now()-interval '30 days' OR e.id IN (
      SELECT id FROM public.control2_device_events
      WHERE game_id=p_game_id ORDER BY created_at DESC,id DESC OFFSET 500
    ));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_device_transport_event(uuid,text,text,jsonb,uuid,bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_device_transport_event(uuid,text,text,jsonb,uuid,bigint)
  TO anon,authenticated;

-- Lease transitions already provide sparse lifecycle points. Include the
-- progress snapshot from the last fenced heartbeat so expiry/replacement can
-- be compared with the game revision that was current at the transition.
CREATE OR REPLACE FUNCTION public._control2_log_device_lease_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_from text;
  v_epoch bigint;
  v_event_id text;
  v_game_rev bigint;
BEGIN
  IF TG_OP='INSERT' THEN
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
  SELECT rev INTO v_game_rev FROM public.game_state WHERE game_id=NEW.game_id;

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
        'focused',NEW.focused,
        'received_revision',NEW.received_rev,
        'rendered_revision',NEW.rendered_rev,
        'started_sound_cue_seq',NEW.started_sound_cue_seq,
        'game_revision',v_game_rev,
        'last_seen_age_ms',least(3600000,greatest(0,
          extract(epoch FROM clock_timestamp()-NEW.last_seen_at)*1000
        ))::integer
      )
    ) ON CONFLICT (game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;

    DELETE FROM public.control2_device_events e
    WHERE e.game_id=NEW.game_id
      AND (e.created_at<now()-interval '30 days' OR e.id IN (
        SELECT id FROM public.control2_device_events
        WHERE game_id=NEW.game_id ORDER BY created_at DESC,id DESC OFFSET 500
      ));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Control 2 lease event was not recorded: %',SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_control2_display_events(p_session_ids uuid[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(session_id::text,events),'{}'::jsonb)
  FROM (
    SELECT e.session_id,jsonb_agg(
      jsonb_build_object(
        'kind','diagnostic',
        'category',CASE
          WHEN e.event_type='lease_state' THEN 'device_lease'
          WHEN e.event_type='transport_state' THEN 'device_transport'
          WHEN e.event_type='state_sync' THEN 'device_state_sync'
          ELSE 'display_state' END,
        'at',e.created_at,
        'message',CASE
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='waiting' THEN 'Urządzenie oczekuje na zwolnienie blokady.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='primary' THEN 'Urządzenie zostało aktywowane jako główne.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='released' THEN 'Urządzenie zwolniło blokadę.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='expired' THEN 'Blokada urządzenia wygasła.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='revoked' THEN 'Połączenie urządzenia zostało cofnięte.'
          WHEN e.event_type='transport_state' AND e.details->>'phase'='recovered' THEN 'Zakończyła się przerwa w bezpośrednim kanale urządzenia.'
          WHEN e.event_type='transport_state' AND e.details->>'phase'='auth_error' THEN 'Nie udało się uruchomić bezpośredniego kanału urządzenia.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='fallback_catchup' THEN 'Odczyt awaryjny nadrobił zmianę stanu gry.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='read_error' THEN 'Odczyt stanu gry z bazy nie powiódł się.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='read_recovered' THEN 'Odczyt stanu gry z bazy wrócił.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_error' THEN 'Urządzenie odebrało stan gry, ale jego obsługa renderu zgłosiła błąd.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_recovered' THEN 'Renderowanie stanu gry wróciło do działania.'
          WHEN e.event_type='transport_state' THEN 'Zmienił się stan bezpośredniego kanału urządzenia.'
          WHEN e.event_type='state_sync' THEN 'Urządzenie zsynchronizowało stan gry.'
          ELSE 'Zdarzenie urządzenia Wyświetlacz.' END,
        'devices',jsonb_build_array(e.device_type),
        'metrics',e.details||jsonb_build_object('reason',e.event_type,'impact',CASE
          WHEN e.event_type='transport_state' AND coalesce((e.details->>'catchup_count')::integer,0)>0 THEN 'fallback_catchup'
          WHEN e.event_type='transport_state' THEN 'transport_recovered'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_error' THEN 'render_failure'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_recovered' THEN 'render_recovered'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='read_error' THEN 'database_read_failure'
          ELSE NULL END)
      ) ORDER BY e.created_at,e.id
    ) AS events
    FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id=e.session_id AND s.control_version=2
    WHERE e.session_id=ANY(coalesce(p_session_ids,'{}'::uuid[]))
    GROUP BY e.session_id
  ) logs;
$$;
REVOKE ALL ON FUNCTION public.get_control2_display_events(uuid[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_control2_display_events(uuid[])
  TO service_role;

NOTIFY pgrst,'reload schema';
