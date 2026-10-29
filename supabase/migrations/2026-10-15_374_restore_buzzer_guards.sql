-- Restore the state and device guards retained by game_state_buzzer_press
-- before device-lease fencing replaced the function in migration 372.
-- Keep the lease check first so stale/secondary devices still cannot inspect
-- game state, then preserve the established lock and physical-buzzer rules.
CREATE OR REPLACE FUNCTION public.game_state_buzzer_press(
  p_game_id uuid,
  p_key text,
  p_team public.game_team,
  p_connection_id uuid DEFAULT NULL,
  p_epoch bigint DEFAULT NULL
) RETURNS public.game_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_old public.game_state;
  v_new public.game_state;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'buzzer',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_old FROM public.game_state WHERE game_id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;

  IF v_old.locked_until IS NOT NULL AND v_old.locked_until>now() THEN
    RAISE EXCEPTION 'locked';
  END IF;

  IF coalesce((v_old.detail #>> '{settings,physicalBuzzer}')::boolean,false) THEN
    RAISE EXCEPTION 'device_disabled';
  END IF;

  UPDATE public.game_state
  SET detail=jsonb_set(detail,'{rounds,duel,lastPressed}',to_jsonb(p_team::text)),
      rev=rev+1,updated_at=now()
  WHERE game_id=p_game_id AND step='r_duel'
    AND (detail #>> '{rounds,duel,lastPressed}') IS NULL
  RETURNING * INTO v_new;

  IF NOT FOUND THEN RAISE EXCEPTION 'already_pressed'; END IF;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team,uuid,bigint) TO anon,authenticated;

NOTIFY pgrst,'reload schema';
