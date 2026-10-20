-- Control 2: nowa karta urządzenia w tej samej przeglądarce przejmuje rolę
-- główną od razu (decyzja użytkownika 2026-10-20, plan Control 2 „Decyzje” 7).
-- Logi: ponowne skanowanie QR / otwieranie linku przy starej karcie
-- zamrożonej w tle telefonu wstrzymywało grę na 10–18 s, aż stara wygaśnie.
--
-- Przejęcie tylko przy pierwszej rejestracji strony (p_meta.takeover = true)
-- i tylko gdy obecna instancja główna ma ten sam identyfikator przeglądarki.
-- Stara instancja przechodzi w oczekiwanie (nie wygasa), więc gdy nowa
-- zniknie, wraca sama; jej ponowne rejestracje nie przejmują, więc dwie
-- otwarte karty nie przerzucają się rolą.
ALTER TABLE public.control_device_connections
  ADD COLUMN browser_context_id text
  CHECK (browser_context_id IS NULL OR browser_context_id ~ '^[A-Za-z0-9_-]{8,80}$');

CREATE OR REPLACE FUNCTION public.control_device_instance_register(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE
  v_session_id uuid;
  v_slot public.control_device_slots;
  v_existing public.control_device_connections;
  v_primary uuid;
  v_context text := CASE WHEN coalesce(p_meta->>'browser_context_id','') ~ '^[A-Za-z0-9_-]{8,80}$'
    THEN p_meta->>'browser_context_id' END;
  v_epoch bigint;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer') OR p_connection_id IS NULL
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF NOT EXISTS (SELECT 1 FROM public.control_runtime_sessions
    WHERE id=v_session_id AND game_id=p_game_id AND device_protocol=2
      AND ended_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.control_device_slots(session_id,game_id,device_type)
  VALUES(v_session_id,p_game_id,p_device_type) ON CONFLICT(session_id,device_type) DO NOTHING;
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND device_type=p_device_type FOR UPDATE;
  SELECT * INTO v_existing FROM public.control_device_connections WHERE id=p_connection_id;
  IF FOUND THEN
    IF v_existing.session_id<>v_session_id OR v_existing.game_id<>p_game_id
       OR v_existing.device_type<>p_device_type
       OR v_existing.state NOT IN ('waiting','primary') THEN RAISE EXCEPTION 'connection_expired'; END IF;
    IF v_existing.state='primary' AND NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id=v_session_id AND s.device_type=p_device_type
        AND s.primary_connection_id=p_connection_id AND s.epoch=v_existing.epoch
        AND s.lease_expires_at>clock_timestamp()
    ) THEN
      UPDATE public.control_device_connections SET state='waiting',epoch=NULL,
        requested_at=clock_timestamp(),last_seen_at=clock_timestamp() WHERE id=p_connection_id;
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
    INSERT INTO public.control_device_connections(id,session_id,game_id,device_type,state,page_visibility,focused,browser_context_id)
    VALUES(p_connection_id,v_session_id,p_game_id,p_device_type,'waiting',
      CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END,
      v_context);
    -- Ta sama przeglądarka otwiera urządzenie od nowa: przejęcie od razu.
    IF v_context IS NOT NULL AND p_meta->'takeover' = 'true'::jsonb
       AND v_slot.primary_connection_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.control_device_connections c
         WHERE c.id=v_slot.primary_connection_id AND c.state='primary'
           AND c.browser_context_id=v_context) THEN
      UPDATE public.control_device_connections SET state='waiting',epoch=NULL,audio_unlocked=false,
        requested_at=clock_timestamp()
      WHERE id=v_slot.primary_connection_id;
      v_epoch := v_slot.epoch + 1;
      UPDATE public.control_device_connections SET state='primary',epoch=v_epoch
      WHERE id=p_connection_id;
      UPDATE public.control_device_slots SET primary_connection_id=p_connection_id,epoch=v_epoch,
        lease_expires_at=clock_timestamp()+interval '12 seconds',updated_at=clock_timestamp()
      WHERE session_id=v_session_id AND device_type=p_device_type;
    END IF;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
