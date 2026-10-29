-- Keep Display audio unlock state separate from device_presence heartbeats.
-- Heartbeats are frequent and may arrive from multiple tabs; they must never
-- overwrite an acknowledged unlock for the active request.
CREATE TABLE public.display_audio_unlock (
  game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  session_nonce text NOT NULL,
  request_nonce text NOT NULL,
  acknowledged_nonce text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

ALTER TABLE public.display_audio_unlock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.display_audio_unlock FROM PUBLIC, anon, authenticated;
CREATE POLICY display_audio_unlock_owner_read ON public.display_audio_unlock
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id=display_audio_unlock.game_id AND g.owner_id=auth.uid()
  ));
GRANT SELECT ON public.display_audio_unlock TO authenticated;

CREATE FUNCTION public.request_display_audio_unlock(p_game_id uuid, p_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_nonce IS NULL OR length(p_nonce)<8 OR length(p_nonce)>100 THEN
    RAISE EXCEPTION 'invalid nonce';
  END IF;
  INSERT INTO public.display_audio_unlock(game_id,request_nonce,acknowledged_nonce,requested_at,acknowledged_at)
  VALUES(p_game_id,p_nonce,NULL,now(),NULL)
  ON CONFLICT(game_id) DO UPDATE SET request_nonce=EXCLUDED.request_nonce,
    acknowledged_nonce=NULL, requested_at=now(), acknowledged_at=NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.request_display_audio_unlock(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_display_audio_unlock(uuid,text) TO authenticated;

CREATE FUNCTION public.begin_display_audio_session(p_game_id uuid,p_key text,p_session_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND share_key_display=p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_session_nonce IS NULL OR length(p_session_nonce)<8 OR length(p_session_nonce)>100 THEN
    RAISE EXCEPTION 'invalid nonce';
  END IF;
  INSERT INTO public.display_audio_unlock(game_id,session_nonce,request_nonce,acknowledged_nonce,requested_at,acknowledged_at)
  VALUES(p_game_id,p_session_nonce,p_session_nonce,NULL,now(),NULL)
  ON CONFLICT(game_id) DO UPDATE SET session_nonce=EXCLUDED.session_nonce,
    request_nonce=EXCLUDED.request_nonce, acknowledged_nonce=NULL,
    requested_at=now(), acknowledged_at=NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_display_audio_session(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_display_audio_session(uuid,text,text) TO anon,authenticated;

CREATE FUNCTION public.acknowledge_display_audio_unlock(p_game_id uuid,p_key text,p_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND share_key_display=p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.display_audio_unlock SET acknowledged_nonce=request_nonce, acknowledged_at=now()
    WHERE game_id=p_game_id AND request_nonce=p_nonce;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text) TO anon,authenticated;
