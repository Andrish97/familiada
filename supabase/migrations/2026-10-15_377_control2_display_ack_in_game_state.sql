-- Keep the durable completion table for owner reads/fallbacks, and mirror the
-- display's rendered revision into game_state so the existing, lease-scoped
-- device stream can deliver the acknowledgment reliably.
ALTER TABLE public.game_state
  ADD COLUMN display_rendered_rev bigint NOT NULL DEFAULT 0
  CHECK (display_rendered_rev >= 0);

COMMENT ON COLUMN public.game_state.display_rendered_rev IS
  'Highest game_state revision acknowledged as rendered by the primary Display; mirrored to game_state for device Realtime delivery.';

CREATE OR REPLACE FUNCTION public.game_state_display_complete(
  p_game_id uuid,p_key text,p_rev bigint,
  p_connection_id uuid DEFAULT NULL,p_epoch bigint DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id;
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

COMMENT ON FUNCTION public.game_state_display_complete(uuid,text,bigint,uuid,bigint) IS
  'Fenced Display acknowledgment. Persists the completion row and mirrors rendered_rev to game_state so all devices receive the acknowledgment on their scoped Realtime stream.';
