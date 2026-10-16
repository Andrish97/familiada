-- Control 2 device leases are now the only supported device protocol.
-- Historical ended sessions retain their original marker for diagnostics.

ALTER TABLE public.control_runtime_sessions
  ALTER COLUMN device_protocol SET DEFAULT 2;

-- No live v1 sessions were present at rollout. Upgrade any row that appeared
-- between that check and this migration so devices must acquire a lease.
UPDATE public.control_runtime_sessions
SET device_protocol = 2
WHERE ended_at IS NULL AND device_protocol = 1;

CREATE OR REPLACE FUNCTION public.control_runtime_session_touch_v2(
  p_game_id uuid, p_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_data jsonb;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner <> v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;

  v_data := public.control_runtime_session_touch(p_game_id,p_session_id);
  IF NOT coalesce((v_data->>'ok')::boolean,false) THEN RETURN v_data; END IF;
  v_session_id := (v_data->>'session_id')::uuid;
  UPDATE public.control_runtime_sessions SET device_protocol=2 WHERE id=v_session_id;
  RETURN v_data || jsonb_build_object('device_protocol',2);
END;
$$;
REVOKE ALL ON FUNCTION public.control_runtime_session_touch_v2(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_runtime_session_touch_v2(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_device_instance_register(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_session_id uuid;
  v_slot public.control_device_slots;
  v_existing public.control_device_connections;
  v_primary uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer') OR p_connection_id IS NULL
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF NOT EXISTS (SELECT 1 FROM public.control_runtime_sessions
    WHERE id=v_session_id AND game_id=p_game_id AND device_protocol=2
      AND ended_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.control_device_slots(session_id,game_id,device_type)
  VALUES(v_session_id,p_game_id,p_device_type) ON CONFLICT(session_id,device_type) DO NOTHING;
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND device_type=p_device_type FOR UPDATE;
  SELECT * INTO v_existing FROM public.control_device_connections WHERE id=p_connection_id;
  IF FOUND THEN
    IF v_existing.session_id<>v_session_id OR v_existing.game_id<>p_game_id
       OR v_existing.device_type<>p_device_type
       OR v_existing.state NOT IN ('waiting','primary') THEN RAISE EXCEPTION 'connection_expired'; END IF;
    IF v_existing.state='primary' AND NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id=v_session_id AND s.device_type=p_device_type
        AND s.primary_connection_id=p_connection_id AND s.epoch=v_existing.epoch
        AND s.lease_expires_at>clock_timestamp()
    ) THEN
      UPDATE public.control_device_connections SET state='waiting',epoch=NULL,
        requested_at=clock_timestamp(),last_seen_at=clock_timestamp() WHERE id=p_connection_id;
    ELSE
      UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
        page_visibility=CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
        focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END
      WHERE id=p_connection_id;
      IF v_existing.state='primary' THEN
        UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp()+interval '12 seconds',
          updated_at=clock_timestamp()
        WHERE session_id=v_session_id AND device_type=p_device_type
          AND primary_connection_id=p_connection_id AND epoch=v_existing.epoch;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.control_device_connections(id,session_id,game_id,device_type,state,page_visibility,focused)
    VALUES(p_connection_id,v_session_id,p_game_id,p_device_type,'waiting',
      CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END);
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.control_device_instance_status(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_session_id uuid; v_primary uuid;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF NOT EXISTS (SELECT 1 FROM public.control_runtime_sessions
    WHERE id=v_session_id AND device_protocol=2 AND ended_at IS NULL AND expires_at>now()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._control_device_action_valid(
  p_game_id uuid, p_device_type text, p_key text,
  p_connection_id uuid, p_epoch bigint
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session_id uuid;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RETURN false; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF NOT EXISTS (SELECT 1 FROM public.control_runtime_sessions
    WHERE id=v_session_id AND game_id=p_game_id AND device_protocol=2
      AND ended_at IS NULL AND expires_at>now()) THEN RETURN false; END IF;
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

NOTIFY pgrst, 'reload schema';
