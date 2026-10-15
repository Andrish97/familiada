-- Update per-instance render progress through the existing fenced heartbeat.
-- This keeps telemetry writes bounded to the normal 3-second lease cadence.
CREATE OR REPLACE FUNCTION public.control_device_instance_heartbeat(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid,
  p_epoch bigint, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_session_id uuid;
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_primary uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','missing'); END IF;
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND OR v_connection.state NOT IN ('waiting','primary') THEN
    RETURN jsonb_build_object('ok',false,'state','expired');
  END IF;

  IF v_connection.state='primary' AND v_slot.primary_connection_id=p_connection_id
     AND v_slot.epoch=p_epoch AND v_slot.lease_expires_at>clock_timestamp() THEN
    UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END,
      received_rev=GREATEST(received_rev,CASE WHEN coalesce(p_meta->>'received_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'received_rev')::bigint ELSE received_rev END),
      rendered_rev=GREATEST(rendered_rev,CASE WHEN coalesce(p_meta->>'rendered_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'rendered_rev')::bigint ELSE rendered_rev END),
      started_sound_cue_seq=GREATEST(started_sound_cue_seq,CASE WHEN coalesce(p_meta->>'started_sound_cue_seq','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'started_sound_cue_seq')::bigint ELSE started_sound_cue_seq END)
    WHERE id=p_connection_id;
    UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp()+interval '12 seconds',
      updated_at=clock_timestamp() WHERE session_id=v_session_id AND device_type=p_device_type;
  ELSIF v_connection.state='primary' THEN
    UPDATE public.control_device_connections SET state='waiting',epoch=NULL,
      requested_at=clock_timestamp(),last_seen_at=clock_timestamp()
    WHERE id=p_connection_id;
  ELSE
    UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END,
      received_rev=GREATEST(received_rev,CASE WHEN coalesce(p_meta->>'received_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'received_rev')::bigint ELSE received_rev END),
      rendered_rev=GREATEST(rendered_rev,CASE WHEN coalesce(p_meta->>'rendered_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'rendered_rev')::bigint ELSE rendered_rev END),
      started_sound_cue_seq=GREATEST(started_sound_cue_seq,CASE WHEN coalesce(p_meta->>'started_sound_cue_seq','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'started_sound_cue_seq')::bigint ELSE started_sound_cue_seq END)
    WHERE id=p_connection_id;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;

COMMENT ON FUNCTION public.control_device_instance_heartbeat(uuid,text,text,uuid,bigint,jsonb) IS
  'Renews an instance lease and monotonically records client render progress, fenced by the active primary epoch.';

NOTIFY pgrst, 'reload schema';
