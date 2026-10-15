-- Enforce per-tab lease fencing at every device read/mutation. Legacy runtime
-- sessions keep their existing key-only contract; protocol 2 requires the
-- connection id and current epoch on each device RPC.

CREATE OR REPLACE FUNCTION public._control_device_action_valid(
  p_game_id uuid, p_device_type text, p_key text,
  p_connection_id uuid, p_epoch bigint
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session_id uuid; v_protocol smallint;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RETURN false; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT device_protocol INTO v_protocol FROM public.control_runtime_sessions
    WHERE id=v_session_id AND game_id=p_game_id AND ended_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_protocol=1 THEN RETURN p_connection_id IS NULL AND p_epoch IS NULL; END IF;
  IF p_connection_id IS NULL OR p_epoch IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.control_device_connections c
    JOIN public.control_device_slots s ON s.session_id=c.session_id AND s.device_type=c.device_type
    WHERE c.id=p_connection_id AND c.session_id=v_session_id AND c.game_id=p_game_id
      AND c.device_type=p_device_type AND c.state='primary' AND c.epoch=p_epoch
      AND c.last_seen_at>clock_timestamp()-interval '12 seconds'
      AND s.primary_connection_id=c.id AND s.epoch=p_epoch
      AND s.lease_expires_at>clock_timestamp()
  );
END;
$$;
REVOKE ALL ON FUNCTION public._control_device_action_valid(uuid,text,text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._control_device_action_valid(uuid,text,text,uuid,bigint) TO postgres,supabase_admin;

DROP FUNCTION public.game_state_get(uuid,public.device_type,text);
CREATE FUNCTION public.game_state_get(
  p_game_id uuid,p_device_type public.device_type,p_key text,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS public.game_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE out public.game_state;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,p_device_type::text,p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO out FROM public.game_state WHERE game_id=p_game_id;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.game_state_get(uuid,public.device_type,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_get(uuid,public.device_type,text,uuid,bigint) TO anon,authenticated;

DROP FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team);
CREATE FUNCTION public.game_state_buzzer_press(
  p_game_id uuid,p_key text,p_team public.game_team,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS public.game_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_new public.game_state;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'buzzer',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.game_state SET detail=jsonb_set(detail,'{rounds,duel,lastPressed}',to_jsonb(p_team::text)),rev=rev+1,updated_at=now()
    WHERE game_id=p_game_id AND step='r_duel' AND (detail #>> '{rounds,duel,lastPressed}') IS NULL
    RETURNING * INTO v_new;
  IF NOT FOUND THEN RAISE EXCEPTION 'already_pressed'; END IF;
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team,uuid,bigint) TO anon,authenticated;

DROP FUNCTION public.game_state_display_complete(uuid,text,bigint);
CREATE FUNCTION public.game_state_display_complete(
  p_game_id uuid,p_key text,p_rev bigint,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id;
  IF current_rev IS NULL OR p_rev IS NULL OR p_rev<0 OR p_rev>current_rev THEN RAISE EXCEPTION 'invalid revision'; END IF;
  INSERT INTO public.game_state_display_completion(game_id,rendered_rev) VALUES(p_game_id,p_rev)
    ON CONFLICT(game_id) DO UPDATE SET rendered_rev=greatest(game_state_display_completion.rendered_rev,excluded.rendered_rev);
END $$;
REVOKE ALL ON FUNCTION public.game_state_display_complete(uuid,text,bigint,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_complete(uuid,text,bigint,uuid,bigint) TO anon,authenticated;

DROP FUNCTION public.game_state_display_is_ready(uuid,text);
CREATE FUNCTION public.game_state_display_is_ready(
  p_game_id uuid,p_key text,p_device_type text DEFAULT 'display',
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_device_type NOT IN ('display','buzzer') OR NOT public._control_device_action_valid(p_game_id,p_device_type,p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN coalesce((SELECT rendered_rev>=requested_rev FROM public.game_state_display_completion WHERE game_id=p_game_id),false);
END $$;
REVOKE ALL ON FUNCTION public.game_state_display_is_ready(uuid,text,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_is_ready(uuid,text,text,uuid,bigint) TO anon,authenticated;

DROP FUNCTION public.begin_display_audio_session(uuid,text,text);
CREATE FUNCTION public.begin_display_audio_session(
  p_game_id uuid,p_key text,p_session_nonce text,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_session_nonce IS NULL OR length(p_session_nonce)<8 OR length(p_session_nonce)>100 THEN RAISE EXCEPTION 'invalid nonce'; END IF;
  INSERT INTO public.display_audio_unlock(game_id,session_nonce,request_nonce,acknowledged_nonce,requested_at,acknowledged_at)
    VALUES(p_game_id,p_session_nonce,p_session_nonce,NULL,now(),NULL)
    ON CONFLICT(game_id) DO UPDATE SET session_nonce=EXCLUDED.session_nonce,request_nonce=EXCLUDED.request_nonce,acknowledged_nonce=NULL,requested_at=now(),acknowledged_at=NULL;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.begin_display_audio_session(uuid,text,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_display_audio_session(uuid,text,text,uuid,bigint) TO anon,authenticated;

DROP FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text);
CREATE FUNCTION public.acknowledge_display_audio_unlock(
  p_game_id uuid,p_key text,p_nonce text,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.display_audio_unlock SET acknowledged_nonce=request_nonce,acknowledged_at=now()
    WHERE game_id=p_game_id AND request_nonce=p_nonce;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text,uuid,bigint) TO anon,authenticated;

-- Preserve the idempotent diagnostic event contract while fencing it to the
-- current Display instance on lease-protocol sessions.
DROP FUNCTION public.control2_display_event(uuid,text,jsonb);
CREATE FUNCTION public.control2_display_event(
  p_game_id uuid,p_key text,p_event jsonb,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid; event_name text; event_details jsonb;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_event IS NULL OR octet_length(p_event::text)>2000 THEN RAISE EXCEPTION 'invalid event'; END IF;
  event_name:=p_event->>'event_type';
  IF event_name IS NULL OR event_name NOT IN ('page_state','render_stall','runtime_error','network_state') THEN RAISE EXCEPTION 'invalid event type'; END IF;
  SELECT a.session_id INTO sid FROM public.game_session_active a
    JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
    WHERE a.game_id=p_game_id AND s.control_version=2 AND s.ended_at IS NULL;
  IF sid IS NULL THEN RETURN false; END IF;
  IF event_name='page_state' THEN
    event_details:=jsonb_build_object('reason',CASE WHEN p_event->>'reason' IN ('initial','visibilitychange','focus','blur') THEN p_event->>'reason' ELSE 'statechange' END,
      'visibility',CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'focused',CASE WHEN jsonb_typeof(p_event->'focused')='boolean' THEN (p_event->>'focused')::boolean ELSE NULL END,
      'was_discarded',CASE WHEN jsonb_typeof(p_event->'was_discarded')='boolean' THEN (p_event->>'was_discarded')::boolean ELSE NULL END);
  ELSIF event_name='render_stall' THEN
    event_details:=jsonb_build_object('max_frame_gap_ms',LEAST(60000,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'max_frame_gap_ms')='number' THEN (p_event->>'max_frame_gap_ms')::numeric ELSE 0 END))::integer,
      'stalled_frames',LEAST(10000,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'stalled_frames')='number' THEN (p_event->>'stalled_frames')::numeric ELSE 0 END))::integer,
      'visibility',CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'state_rev',LEAST(9223372036854775807::numeric,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint);
  ELSIF event_name='runtime_error' THEN
    event_details:=jsonb_build_object('phase',CASE WHEN p_event->>'phase' IN ('render','completion_ack') THEN p_event->>'phase' ELSE 'other' END,
      'error_name',left(coalesce(p_event->>'error_name','Error'),80),
      'state_rev',LEAST(9223372036854775807::numeric,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint);
  ELSE
    event_details:=jsonb_build_object('online',CASE WHEN jsonb_typeof(p_event->'online')='boolean' THEN (p_event->>'online')::boolean ELSE false END);
  END IF;
  INSERT INTO public.control2_device_events(game_id,session_id,event_type,event_id,details)
    VALUES(p_game_id,sid,event_name,left(p_event->>'event_id',80),event_details)
    ON CONFLICT(game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;
  DELETE FROM public.control2_device_events e WHERE e.game_id=p_game_id AND
    (e.created_at<now()-interval '30 days' OR e.id IN (SELECT id FROM public.control2_device_events WHERE game_id=p_game_id ORDER BY created_at DESC,id DESC OFFSET 500));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.control2_display_event(uuid,text,jsonb,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_display_event(uuid,text,jsonb,uuid,bigint) TO anon,authenticated;

NOTIFY pgrst,'reload schema';
