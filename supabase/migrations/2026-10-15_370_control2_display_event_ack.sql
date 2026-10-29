-- A void RPC silently discards device events when no Control 2 session is
-- active yet. Return an explicit acknowledgement so Display can retry the
-- startup race instead of treating a dropped event as successfully stored.
ALTER TABLE public.control2_device_events ADD COLUMN event_id text;
CREATE UNIQUE INDEX control2_device_events_event_id_idx
  ON public.control2_device_events(game_id,event_id) WHERE event_id IS NOT NULL;

DROP FUNCTION public.control2_display_event(uuid, text, jsonb);

CREATE FUNCTION public.control2_display_event(
  p_game_id uuid, p_key text, p_event jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  sid uuid;
  event_name text;
  event_details jsonb;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id, 'display', p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_event IS NULL OR octet_length(p_event::text) > 2000 THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  event_name := p_event->>'event_type';
  IF event_name IS NULL OR event_name NOT IN ('page_state','render_stall','runtime_error','network_state') THEN
    RAISE EXCEPTION 'invalid event type';
  END IF;

  SELECT a.session_id INTO sid
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=p_game_id AND s.control_version=2 AND s.ended_at IS NULL;
  IF sid IS NULL THEN RETURN false; END IF;

  IF event_name='page_state' THEN
    event_details := jsonb_build_object(
      'reason', CASE WHEN p_event->>'reason' IN ('initial','visibilitychange','focus','blur') THEN p_event->>'reason' ELSE 'statechange' END,
      'visibility', CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'focused', CASE WHEN jsonb_typeof(p_event->'focused')='boolean' THEN (p_event->>'focused')::boolean ELSE NULL END,
      'was_discarded', CASE WHEN jsonb_typeof(p_event->'was_discarded')='boolean' THEN (p_event->>'was_discarded')::boolean ELSE NULL END
    );
  ELSIF event_name='render_stall' THEN
    event_details := jsonb_build_object(
      'max_frame_gap_ms', LEAST(60000, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'max_frame_gap_ms')='number' THEN (p_event->>'max_frame_gap_ms')::numeric ELSE 0 END))::integer,
      'stalled_frames', LEAST(10000, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'stalled_frames')='number' THEN (p_event->>'stalled_frames')::numeric ELSE 0 END))::integer,
      'visibility', CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'state_rev', LEAST(9223372036854775807::numeric, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint
    );
  ELSIF event_name='runtime_error' THEN
    event_details := jsonb_build_object(
      'phase', CASE WHEN p_event->>'phase' IN ('render','completion_ack') THEN p_event->>'phase' ELSE 'other' END,
      'error_name', left(coalesce(p_event->>'error_name','Error'),80),
      'state_rev', LEAST(9223372036854775807::numeric, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint
    );
  ELSE
    event_details := jsonb_build_object(
      'online', CASE WHEN jsonb_typeof(p_event->'online')='boolean' THEN (p_event->>'online')::boolean ELSE false END
    );
  END IF;

  INSERT INTO public.control2_device_events(game_id,session_id,event_type,event_id,details)
  VALUES (p_game_id,sid,event_name,left(p_event->>'event_id',80),event_details)
  ON CONFLICT (game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;

  DELETE FROM public.control2_device_events e
  WHERE e.game_id=p_game_id
    AND (e.created_at < now()-interval '30 days' OR e.id IN (
      SELECT id FROM public.control2_device_events
      WHERE game_id=p_game_id ORDER BY created_at DESC,id DESC OFFSET 500
    ));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_display_event(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_display_event(uuid,text,jsonb) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
