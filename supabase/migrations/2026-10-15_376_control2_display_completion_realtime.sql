-- Display completion is durable state consumed by Control and Buzzer. Stream
-- it over Realtime while keeping the existing RPC/read path as a fallback.
ALTER TABLE public.game_state_display_completion REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='game_state_display_completion'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.game_state_display_completion;
  END IF;
END;
$$;

-- Owner Control already has row access. A device gets only the completion
-- row for its own game while its short-lived JWT still matches the live lease.
CREATE POLICY display_completion_device_realtime_read
  ON public.game_state_display_completion FOR SELECT TO anon
  USING (public.control_device_realtime_claim_valid(game_id, auth.jwt()));
GRANT SELECT ON public.game_state_display_completion TO anon;

COMMENT ON POLICY display_completion_device_realtime_read
  ON public.game_state_display_completion IS
  'Allows only a signed primary-device JWT with a current lease to receive the completion row for its game.';
