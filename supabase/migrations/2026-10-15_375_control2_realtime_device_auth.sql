-- Scoped authorization for direct Postgres Changes. A short-lived project JWT
-- is issued by the Edge Function only after the six-character/link key and
-- current lease have been checked. RLS rechecks the live lease on every read,
-- so a promoted/released device immediately loses access even before expiry.

CREATE OR REPLACE FUNCTION public.control_device_realtime_claim_valid(
  p_game_id uuid, p_claims jsonb
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_game uuid; v_session uuid; v_connection uuid; v_epoch bigint;
  v_device text;
BEGIN
  IF p_claims IS NULL OR p_claims->>'role'<>'anon'
     OR p_claims->>'device_type' NOT IN ('display','host','buzzer')
     OR (p_claims->>'exp')::bigint <= extract(epoch FROM clock_timestamp())::bigint THEN RETURN false; END IF;
  v_game := (p_claims->>'game_id')::uuid;
  v_session := (p_claims->>'session_id')::uuid;
  v_connection := (p_claims->>'connection_id')::uuid;
  v_epoch := (p_claims->>'epoch')::bigint;
  v_device := p_claims->>'device_type';
  RETURN EXISTS (
    SELECT 1
    FROM public.control_runtime_sessions s
    JOIN public.control_device_slots slot ON slot.session_id=s.id
    JOIN public.control_device_connections c
      ON c.id=slot.primary_connection_id AND c.session_id=s.id
    WHERE v_game=p_game_id AND s.id=v_session
      AND s.game_id=p_game_id AND s.device_protocol=2
      AND s.ended_at IS NULL AND s.expires_at>clock_timestamp()
      AND slot.game_id=p_game_id AND slot.device_type=v_device
      AND slot.primary_connection_id=v_connection AND slot.epoch=v_epoch
      AND slot.lease_expires_at>clock_timestamp()
      AND c.state='primary' AND c.epoch=slot.epoch
      AND c.last_seen_at>clock_timestamp()-interval '12 seconds'
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_realtime_claim_valid(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.control_device_realtime_claim_valid(uuid,jsonb)
  TO anon, postgres, supabase_admin;

CREATE POLICY game_state_device_realtime_read
  ON public.game_state FOR SELECT TO anon
  USING (public.control_device_realtime_claim_valid(game_id, auth.jwt()));
GRANT SELECT ON public.game_state TO anon;

CREATE OR REPLACE FUNCTION public.control_device_realtime_authorize(
  p_game_id uuid, p_device_type text, p_key text,
  p_connection_id uuid, p_epoch bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session_id uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public._control_device_action_valid(
       p_game_id,p_device_type,p_key,p_connection_id,p_epoch
     ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF v_session_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.control_runtime_sessions
    WHERE id=v_session_id AND device_protocol=2
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'game_id',p_game_id,'device_type',p_device_type,
    'session_id',v_session_id,'connection_id',p_connection_id,'epoch',p_epoch
  );
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_realtime_authorize(uuid,text,text,uuid,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.control_device_realtime_authorize(uuid,text,text,uuid,bigint)
  TO service_role;

COMMENT ON POLICY game_state_device_realtime_read ON public.game_state IS
  'Allows postgres_changes only to a signed device JWT whose session, type, primary connection and epoch still match the live lease.';
