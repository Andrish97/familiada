-- Existing protocol-1 Buzzer clients historically omit device_type when
-- checking Display readiness. Preserve that key-based behavior while still
-- requiring explicit type + lease epoch for protocol-2 connections.
DROP FUNCTION public.game_state_display_is_ready(uuid,text,text,uuid,bigint);
CREATE FUNCTION public.game_state_display_is_ready(
  p_game_id uuid,p_key text,p_device_type text DEFAULT NULL,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_device_type IS NULL THEN
    IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch)
       AND NOT public._control_device_action_valid(p_game_id,'buzzer',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF p_device_type NOT IN ('display','buzzer')
     OR NOT public._control_device_action_valid(p_game_id,p_device_type,p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN coalesce((SELECT rendered_rev>=requested_rev FROM public.game_state_display_completion WHERE game_id=p_game_id),false);
END $$;
REVOKE ALL ON FUNCTION public.game_state_display_is_ready(uuid,text,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_is_ready(uuid,text,text,uuid,bigint) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
