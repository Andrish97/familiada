-- Migration 312's request RPC must provide the NOT NULL session_nonce even
-- when a Display session row already exists. The upsert preserves that
-- existing session nonce and only replaces the current request/ack state.
CREATE OR REPLACE FUNCTION public.request_display_audio_unlock(p_game_id uuid, p_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_nonce IS NULL OR length(p_nonce)<8 OR length(p_nonce)>100 THEN
    RAISE EXCEPTION 'invalid nonce';
  END IF;
  INSERT INTO public.display_audio_unlock(
    game_id,session_nonce,request_nonce,acknowledged_nonce,requested_at,acknowledged_at
  ) VALUES(p_game_id,p_nonce,p_nonce,NULL,now(),NULL)
  ON CONFLICT(game_id) DO UPDATE SET request_nonce=EXCLUDED.request_nonce,
    acknowledged_nonce=NULL, requested_at=now(), acknowledged_at=NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.request_display_audio_unlock(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_display_audio_unlock(uuid,text) TO authenticated;
