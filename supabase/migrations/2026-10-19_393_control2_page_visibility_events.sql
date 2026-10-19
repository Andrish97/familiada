-- Persist every active visibility transition from the current primary instance
-- of Display, Host, or Buzzer in the existing Admin device event log.
ALTER TABLE public.control2_device_events
  DROP CONSTRAINT control2_device_events_device_type_check;
ALTER TABLE public.control2_device_events
  ADD CONSTRAINT control2_device_events_device_type_check
    CHECK (device_type IN ('display','host','buzzer','control'));

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
  IF v_event_type='page_state' THEN
    IF p_event->>'reason' NOT IN ('initial','visibilitychange')
       OR p_event->>'visibility' NOT IN ('visible','hidden') THEN
      RAISE EXCEPTION 'invalid page state';
    END IF;
  ELSE
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
    'visibility_reason',CASE WHEN v_event_type='page_state' THEN p_event->>'reason' ELSE NULL END,
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
NOTIFY pgrst, 'reload schema';

-- Control does not use a device lease. Its authenticated game owner records
-- visibility in the same bounded event stream and Admin export instead.
CREATE OR REPLACE FUNCTION public.control2_control_visibility_event(
  p_game_id uuid,
  p_event jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_event_id text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.games g WHERE g.id=p_game_id AND g.owner_id=auth.uid()
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_event IS NULL OR octet_length(p_event::text)>2000
     OR p_event->>'reason' NOT IN ('initial','visibilitychange')
     OR p_event->>'visibility' NOT IN ('visible','hidden') THEN
    RAISE EXCEPTION 'invalid page state';
  END IF;
  v_event_id:=left(coalesce(p_event->>'event_id',''),80);
  IF v_event_id='' THEN RAISE EXCEPTION 'event_id_required'; END IF;

  SELECT a.session_id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=p_game_id AND s.control_version=2 AND s.ended_at IS NULL;
  IF v_session_id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.control2_device_events(
    game_id,session_id,device_type,event_type,event_id,details
  ) VALUES (
    p_game_id,v_session_id,'control','page_state',v_event_id,
    jsonb_build_object(
      'device_type','control',
      'visibility_reason',p_event->>'reason',
      'visibility',p_event->>'visibility',
      'focused',CASE WHEN jsonb_typeof(p_event->'focused')='boolean'
        THEN (p_event->>'focused')::boolean ELSE NULL END,
      'online',CASE WHEN jsonb_typeof(p_event->'online')='boolean'
        THEN (p_event->>'online')::boolean ELSE NULL END,
      'was_discarded',CASE WHEN jsonb_typeof(p_event->'was_discarded')='boolean'
        THEN (p_event->>'was_discarded')::boolean ELSE NULL END
    )
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
REVOKE ALL ON FUNCTION public.control2_control_visibility_event(uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control2_control_visibility_event(uuid,jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
