-- Control v2 device instance registry and per-session resource leases.
-- This migration is additive: existing sessions stay on protocol 1 and the
-- existing link/share/code contracts are untouched. The v2 runtime touch
-- opts in only newly-created runtime sessions.

ALTER TABLE public.control_runtime_sessions
  ADD COLUMN device_protocol smallint NOT NULL DEFAULT 1
  CHECK (device_protocol IN (1, 2));

CREATE TABLE public.control_device_connections (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.control_runtime_sessions(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('display','host','buzzer')),
  state text NOT NULL CHECK (state IN ('waiting','primary','released','expired','revoked')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at timestamptz,
  epoch bigint,
  page_visibility text CHECK (page_visibility IS NULL OR page_visibility IN ('visible','hidden','unknown')),
  focused boolean,
  received_rev bigint NOT NULL DEFAULT 0 CHECK (received_rev >= 0),
  rendered_rev bigint NOT NULL DEFAULT 0 CHECK (rendered_rev >= 0),
  started_sound_cue_seq bigint NOT NULL DEFAULT 0 CHECK (started_sound_cue_seq >= 0),
  UNIQUE (id, session_id, game_id, device_type)
);

CREATE INDEX control_device_connections_queue_idx
  ON public.control_device_connections(session_id, device_type, requested_at, id)
  WHERE state = 'waiting';
CREATE INDEX control_device_connections_expiry_idx
  ON public.control_device_connections(last_seen_at)
  WHERE state IN ('waiting','primary');
CREATE UNIQUE INDEX control_device_connections_one_primary_idx
  ON public.control_device_connections(session_id, device_type)
  WHERE state = 'primary';

CREATE TABLE public.control_device_slots (
  session_id uuid NOT NULL REFERENCES public.control_runtime_sessions(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('display','host','buzzer')),
  primary_connection_id uuid,
  epoch bigint NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (session_id, device_type),
  FOREIGN KEY (primary_connection_id, session_id, game_id, device_type)
    REFERENCES public.control_device_connections(id, session_id, game_id, device_type)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((primary_connection_id IS NULL) = (lease_expires_at IS NULL))
);

ALTER TABLE public.control_device_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_device_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.control_device_connections, public.control_device_slots
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.control_runtime_session_touch_v2(
  p_game_id uuid, p_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_existing_id uuid;
  v_existing_protocol smallint;
  v_data jsonb;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner <> v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;

  SELECT id, device_protocol INTO v_existing_id, v_existing_protocol
  FROM public.control_runtime_sessions
  WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now()
  FOR UPDATE;

  v_data := public.control_runtime_session_touch(p_game_id,p_session_id);
  IF NOT coalesce((v_data->>'ok')::boolean,false) THEN RETURN v_data; END IF;
  v_session_id := (v_data->>'session_id')::uuid;

  -- Do not switch a live legacy session underneath already-open devices.
  -- A fresh session created by this client starts on the lease protocol.
  IF v_existing_id IS NULL THEN
    UPDATE public.control_runtime_sessions SET device_protocol=2 WHERE id=v_session_id;
    v_existing_protocol := 2;
  END IF;
  RETURN v_data || jsonb_build_object('device_protocol',coalesce(v_existing_protocol,1));
END;
$$;
REVOKE ALL ON FUNCTION public.control_runtime_session_touch_v2(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_runtime_session_touch_v2(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._control_device_session_for_key(
  p_game_id uuid, p_device_type text, p_key text
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.session_id
  FROM public.control_device_link_tokens t
  JOIN public.control_runtime_sessions s ON s.id=t.session_id
  WHERE t.game_id=p_game_id AND t.device_type=p_device_type AND t.token::text=p_key
    AND s.ended_at IS NULL AND s.expires_at>now()
  UNION ALL
  SELECT sh.session_id
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  WHERE sh.game_id=p_game_id AND sh.device_type=p_device_type AND sh.token::text=p_key
    AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._control_device_session_for_key(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._control_device_session_for_key(uuid,text,text) TO postgres, supabase_admin;

CREATE OR REPLACE FUNCTION public._control_device_promote_waiting(
  p_session_id uuid, p_device_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_slot public.control_device_slots;
  v_candidate uuid;
  v_epoch bigint;
BEGIN
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=p_session_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_slot.primary_connection_id IS NOT NULL
     AND v_slot.lease_expires_at > clock_timestamp()
     AND EXISTS (
       SELECT 1 FROM public.control_device_connections c
       WHERE c.id=v_slot.primary_connection_id AND c.state='primary'
         AND c.last_seen_at > clock_timestamp()-interval '12 seconds'
     ) THEN
    RETURN v_slot.primary_connection_id;
  END IF;

  IF v_slot.primary_connection_id IS NOT NULL THEN
    UPDATE public.control_device_connections SET state='expired',epoch=NULL
    WHERE id=v_slot.primary_connection_id AND state='primary';
  END IF;
  UPDATE public.control_device_connections SET state='expired',epoch=NULL
  WHERE session_id=p_session_id AND device_type=p_device_type AND state='waiting'
    AND last_seen_at<=clock_timestamp()-interval '12 seconds';

  SELECT c.id INTO v_candidate
  FROM public.control_device_connections c
  WHERE c.session_id=p_session_id AND c.device_type=p_device_type
    AND c.state='waiting' AND c.last_seen_at > clock_timestamp()-interval '12 seconds'
  ORDER BY c.requested_at,c.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_candidate IS NULL THEN
    UPDATE public.control_device_slots SET primary_connection_id=NULL,
      epoch=CASE WHEN v_slot.primary_connection_id IS NULL THEN v_slot.epoch ELSE v_slot.epoch+1 END,
      lease_expires_at=NULL,updated_at=clock_timestamp()
    WHERE session_id=p_session_id AND device_type=p_device_type;
    RETURN NULL;
  END IF;

  v_epoch := v_slot.epoch + 1;
  UPDATE public.control_device_connections SET state='primary',epoch=v_epoch
  WHERE id=v_candidate;
  UPDATE public.control_device_slots SET primary_connection_id=v_candidate,epoch=v_epoch,
    lease_expires_at=clock_timestamp()+interval '12 seconds',updated_at=clock_timestamp()
  WHERE session_id=p_session_id AND device_type=p_device_type;
  RETURN v_candidate;
END;
$$;
REVOKE ALL ON FUNCTION public._control_device_promote_waiting(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._control_device_promote_waiting(uuid,text) TO postgres, supabase_admin;

CREATE OR REPLACE FUNCTION public._control_device_status(
  p_session_id uuid, p_device_type text, p_connection_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_position integer;
  v_waiting integer;
BEGIN
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=p_session_id AND device_type=p_device_type;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','missing'); END IF;
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=p_session_id AND device_type=p_device_type;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state',v_connection.state); END IF;
  SELECT count(*)::integer INTO v_waiting FROM public.control_device_connections
  WHERE session_id=p_session_id AND device_type=p_device_type AND state='waiting'
    AND last_seen_at>clock_timestamp()-interval '12 seconds';
  IF v_connection.state='waiting' THEN
    SELECT count(*)::integer+1 INTO v_position FROM public.control_device_connections c
    WHERE c.session_id=p_session_id AND c.device_type=p_device_type AND c.state='waiting'
      AND c.last_seen_at>clock_timestamp()-interval '12 seconds'
      AND (c.requested_at,c.id)<(v_connection.requested_at,v_connection.id);
  END IF;
  RETURN jsonb_build_object('ok',true,'state',v_connection.state,
    'epoch',v_connection.epoch,'lease_expires_at',v_slot.lease_expires_at,
    'waiting_count',v_waiting,'queue_position',v_position);
END;
$$;
REVOKE ALL ON FUNCTION public._control_device_status(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._control_device_status(uuid,text,uuid) TO postgres, supabase_admin;

CREATE OR REPLACE FUNCTION public.control_device_instance_register(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_session_id uuid;
  v_protocol smallint;
  v_slot public.control_device_slots;
  v_existing public.control_device_connections;
  v_primary uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer') OR p_connection_id IS NULL
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT device_protocol INTO v_protocol FROM public.control_runtime_sessions
  WHERE id=v_session_id AND game_id=p_game_id AND ended_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_protocol<>2 THEN RETURN jsonb_build_object('ok',true,'mode','legacy'); END IF;

  INSERT INTO public.control_device_slots(session_id,game_id,device_type)
  VALUES(v_session_id,p_game_id,p_device_type) ON CONFLICT(session_id,device_type) DO NOTHING;
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND device_type=p_device_type FOR UPDATE;
  SELECT * INTO v_existing FROM public.control_device_connections
  WHERE id=p_connection_id;
  IF FOUND THEN
    IF v_existing.session_id<>v_session_id OR v_existing.game_id<>p_game_id
       OR v_existing.device_type<>p_device_type
       OR v_existing.state NOT IN ('waiting','primary') THEN
      RAISE EXCEPTION 'connection_expired';
    END IF;
    IF v_existing.state='primary' AND NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id=v_session_id AND s.device_type=p_device_type
        AND s.primary_connection_id=p_connection_id AND s.epoch=v_existing.epoch
        AND s.lease_expires_at>clock_timestamp()
    ) THEN
      UPDATE public.control_device_connections SET state='waiting',epoch=NULL,
        requested_at=clock_timestamp(),last_seen_at=clock_timestamp()
      WHERE id=p_connection_id;
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
    INSERT INTO public.control_device_connections(
      id,session_id,game_id,device_type,state,page_visibility,focused
    ) VALUES (
      p_connection_id,v_session_id,p_game_id,p_device_type,'waiting',
      CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END
    );
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_instance_register(uuid,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_device_instance_register(uuid,text,text,uuid,jsonb) TO anon,authenticated;

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
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END
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
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END
    WHERE id=p_connection_id;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_instance_heartbeat(uuid,text,text,uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_device_instance_heartbeat(uuid,text,text,uuid,bigint,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.control_device_instance_release(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid, p_epoch bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_session_id uuid;
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_primary uuid;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'released',false); END IF;
  IF v_connection.state='primary' AND v_connection.epoch=p_epoch
     AND v_slot.primary_connection_id=p_connection_id AND v_slot.epoch=p_epoch THEN
    UPDATE public.control_device_connections SET state='released',released_at=clock_timestamp(),epoch=NULL
    WHERE id=p_connection_id;
    UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE session_id=v_session_id AND device_type=p_device_type;
  ELSIF v_connection.state='waiting' THEN
    UPDATE public.control_device_connections SET state='released',released_at=clock_timestamp()
    WHERE id=p_connection_id;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN jsonb_build_object('ok',true,'released',true,'primary_connection_id',v_primary);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_instance_release(uuid,text,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_device_instance_release(uuid,text,text,uuid,bigint) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.control_device_instance_status(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_session_id uuid; v_primary uuid;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF NOT EXISTS(SELECT 1 FROM public.control_runtime_sessions WHERE id=v_session_id AND device_protocol=2) THEN
    RETURN jsonb_build_object('ok',true,'mode','legacy');
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_instance_status(uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_device_instance_status(uuid,text,text,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.control_device_slots_for_owner(p_game_id uuid)
RETURNS TABLE(device_type text,primary_online boolean,waiting_count integer,lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.device_type,
    s.primary_connection_id IS NOT NULL AND s.lease_expires_at>clock_timestamp(),
    (SELECT count(*)::integer FROM public.control_device_connections c
      WHERE c.session_id=s.session_id AND c.device_type=s.device_type AND c.state='waiting'
        AND c.last_seen_at>clock_timestamp()-interval '12 seconds'),
    s.lease_expires_at
  FROM public.control_device_slots s
  JOIN public.control_runtime_sessions r ON r.id=s.session_id
  WHERE s.game_id=p_game_id AND r.ended_at IS NULL AND r.expires_at>now();
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_slots_for_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_device_slots_for_owner(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
