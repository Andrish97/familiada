-- Completion is separate from presence: an online Display may still animate.
CREATE TABLE public.game_state_display_completion (
  game_id uuid PRIMARY KEY REFERENCES public.game_state(game_id) ON DELETE CASCADE,
  rendered_rev bigint NOT NULL DEFAULT 0,
  requested_rev bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.game_state_display_completion ENABLE ROW LEVEL SECURITY;
CREATE POLICY display_completion_owner ON public.game_state_display_completion FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_state_display_completion.game_id AND g.owner_id = auth.uid()));
GRANT SELECT ON public.game_state_display_completion TO authenticated;

CREATE FUNCTION public.game_state_display_complete(p_game_id uuid, p_key text, p_rev bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE g public.games; current_rev bigint;
BEGIN
 SELECT * INTO g FROM public.games WHERE id = p_game_id;
 IF NOT FOUND OR nullif(p_key, '') IS NULL OR g.share_key_display IS DISTINCT FROM p_key THEN
  RAISE EXCEPTION 'forbidden';
 END IF;
 SELECT rev INTO current_rev FROM public.game_state WHERE game_id = p_game_id;
 IF current_rev IS NULL OR p_rev IS NULL OR p_rev < 0 OR p_rev > current_rev THEN RAISE EXCEPTION 'invalid revision'; END IF;
 INSERT INTO public.game_state_display_completion(game_id, rendered_rev) VALUES(p_game_id, p_rev)
 ON CONFLICT (game_id) DO UPDATE SET rendered_rev = greatest(game_state_display_completion.rendered_rev, excluded.rendered_rev);
END $$;
REVOKE ALL ON FUNCTION public.game_state_display_complete(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_complete(uuid,text,bigint) TO anon, authenticated;

CREATE FUNCTION public.game_state_display_is_ready(p_game_id uuid, p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE g public.games;
BEGIN
 SELECT * INTO g FROM public.games WHERE id = p_game_id;
 IF NOT FOUND OR nullif(p_key,'') IS NULL OR
   (g.share_key_display IS DISTINCT FROM p_key AND g.share_key_buzzer IS DISTINCT FROM p_key) THEN
  RAISE EXCEPTION 'forbidden';
 END IF;
 RETURN coalesce((SELECT rendered_rev >= requested_rev FROM public.game_state_display_completion WHERE game_id = p_game_id), false);
END $$;
REVOKE ALL ON FUNCTION public.game_state_display_is_ready(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_is_ready(uuid,text) TO anon, authenticated;

-- One request per state revision, irrespective of parallel scene animations.
CREATE FUNCTION public.request_display_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP = 'INSERT' OR NEW.step IS DISTINCT FROM OLD.step OR
    NEW.sound_cue_seq IS DISTINCT FROM OLD.sound_cue_seq THEN
  INSERT INTO public.game_state_display_completion(game_id, requested_rev) VALUES(NEW.game_id, NEW.rev)
  ON CONFLICT(game_id) DO UPDATE SET requested_rev = excluded.requested_rev;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.request_display_completion() FROM PUBLIC;
CREATE TRIGGER request_display_completion AFTER INSERT OR UPDATE ON public.game_state
FOR EACH ROW EXECUTE FUNCTION public.request_display_completion();

CREATE FUNCTION public.guard_final_display_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.step::text = 'r_duel' AND NEW.detail#>>'{rounds,duel,lastPressed}' IS DISTINCT FROM OLD.detail#>>'{rounds,duel,lastPressed}' AND
   EXISTS(SELECT FROM public.game_state_display_completion WHERE game_id = OLD.game_id AND rendered_rev < requested_rev) THEN
  RAISE EXCEPTION 'display still rendering';
 END IF;
 IF ((NEW.step::text = 'f_end' AND OLD.step::text LIKE 'f_p%_map_q%') OR
     (OLD.step::text IN ('r_duel', 'r_play') AND OLD.sound_cue_key = 'reveal' AND
      (NEW.step::text IN ('r_gameEnd', 'f_start', 'r_roundStart') OR NEW.phase::text = 'REVEAL'))) AND
   coalesce((SELECT rendered_rev < requested_rev FROM public.game_state_display_completion WHERE game_id = OLD.game_id), true) THEN
  RAISE EXCEPTION 'display still rendering';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_final_display_completion() FROM PUBLIC;
CREATE TRIGGER guard_final_display_completion BEFORE UPDATE ON public.game_state
FOR EACH ROW EXECUTE FUNCTION public.guard_final_display_completion();
NOTIFY pgrst, 'reload schema';
