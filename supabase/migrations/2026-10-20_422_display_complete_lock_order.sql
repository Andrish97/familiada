-- Control 2: zakleszczenie (40P01) przy potwierdzeniu planszy.
-- game_state_write blokuje wiersz game_state, a trigger
-- request_display_completion potem game_state_display_completion.
-- game_state_display_complete robił to w odwrotnej kolejności, więc
-- równoczesny zapis Control i potwierdzenie Wyświetlacza kończyły się
-- deadlockiem (w statystykach: completion_ack 40P01; ofiarą bywał też zapis
-- Control). Teraz potwierdzenie najpierw blokuje game_state.
CREATE OR REPLACE FUNCTION public.game_state_display_complete(
  p_game_id uuid, p_key text, p_rev bigint,
  p_connection_id uuid DEFAULT NULL, p_epoch bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id FOR UPDATE;
  IF current_rev IS NULL OR p_rev IS NULL OR p_rev<0 OR p_rev>current_rev THEN
    RAISE EXCEPTION 'invalid revision';
  END IF;

  INSERT INTO public.game_state_display_completion(game_id,rendered_rev)
    VALUES(p_game_id,p_rev)
    ON CONFLICT(game_id) DO UPDATE
      SET rendered_rev=greatest(game_state_display_completion.rendered_rev,excluded.rendered_rev);

  -- This update emits the acknowledgment through the same RLS protected
  -- game_state stream already consumed by every device.
  UPDATE public.game_state
    SET display_rendered_rev=greatest(display_rendered_rev,p_rev)
    WHERE game_id=p_game_id AND display_rendered_rev<p_rev;
END $$;
