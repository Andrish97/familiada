-- Control 2: nowe otwarcie urządzenia przejmuje je od razu z dowolnej
-- przeglądarki, a wyparta karta nie wraca sama (decyzja użytkownika
-- 2026-10-23, plan Control 2 „Decyzje” 7; zastępuje regułę „inna
-- przeglądarka czeka” z 423). Czekanie 12–15 s na wygaśnięcie lease tylko
-- irytowało — klucz urządzenia ma i tak tylko prowadzący gry.
--
-- * Pierwsza rejestracja strony (p_meta.takeover = true) przejmuje rolę
--   główną od żywej instancji; ta przechodzi w stan 'replaced'.
-- * 'replaced' nie czeka w kolejce i nie jest promowany: stara karta pokazuje
--   „otwarto w innym miejscu” i przejmuje tylko po świadomym kliknięciu
--   (nowa rejestracja z takeover).
-- * Rejestracja bez takeover (np. wybudzona karta, której lease wygasł) przy
--   żywej instancji głównej też dostaje 'replaced' zamiast kolejki. Gdy nikt
--   nie jest główny — przejmuje jak dotąd (sama uśpiona karta wraca).
-- Zgodne wstecz: stary front wysyła takeover przy pierwszej rejestracji,
-- a 'replaced' traktuje jak wygaśnięcie.

ALTER TABLE public.control_device_connections
  DROP CONSTRAINT control_device_connections_state_check;
ALTER TABLE public.control_device_connections
  ADD CONSTRAINT control_device_connections_state_check
  CHECK (state IN ('waiting','primary','released','expired','revoked','replaced'));

-- Instancja czekająca przy żywej instancji głównej zostaje wyparta.
CREATE OR REPLACE FUNCTION public._control_device_replace_if_other_primary(
  p_connection_id uuid, p_primary uuid
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.control_device_connections
  SET state='replaced',epoch=NULL,released_at=clock_timestamp()
  WHERE id=p_connection_id AND state='waiting'
    AND p_primary IS NOT NULL AND p_primary<>p_connection_id;
$$;
REVOKE ALL ON FUNCTION public._control_device_replace_if_other_primary(uuid,uuid) FROM PUBLIC, anon, authenticated;

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
       OR v_existing.device_type<>p_device_type THEN RAISE EXCEPTION 'connection_expired'; END IF;
    IF v_existing.state='replaced' THEN
      RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
        || jsonb_build_object('mode','lease','primary',false);
    END IF;
    IF v_existing.state NOT IN ('waiting','primary') THEN RAISE EXCEPTION 'connection_expired'; END IF;
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
    -- Nowe otwarcie (dowolna przeglądarka): przejęcie od razu.
    IF p_meta->'takeover' = 'true'::jsonb THEN
      v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
      IF v_primary IS NOT NULL AND v_primary<>p_connection_id THEN
        SELECT * INTO v_slot FROM public.control_device_slots
        WHERE session_id=v_session_id AND device_type=p_device_type FOR UPDATE;
        UPDATE public.control_device_connections SET state='replaced',epoch=NULL,audio_unlocked=false,
          released_at=clock_timestamp()
        WHERE session_id=v_session_id AND device_type=p_device_type
          AND state IN ('primary','waiting') AND id<>p_connection_id;
        v_epoch := v_slot.epoch + 1;
        UPDATE public.control_device_connections SET state='primary',epoch=v_epoch
        WHERE id=p_connection_id;
        UPDATE public.control_device_slots SET primary_connection_id=p_connection_id,epoch=v_epoch,
          lease_expires_at=clock_timestamp()+interval '12 seconds',updated_at=clock_timestamp()
        WHERE session_id=v_session_id AND device_type=p_device_type;
      END IF;
    END IF;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  PERFORM public._control_device_replace_if_other_primary(p_connection_id,v_primary);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;

-- Heartbeat: wyparta karta dostaje 'replaced' (nie 'expired', po którym front
-- rejestrowałby się od nowa); czekająca przy żywej głównej zostaje wyparta.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.control_device_instance_heartbeat(uuid,text,text,uuid,bigint,jsonb)'::regprocedure);
  v_old text := 'RETURN jsonb_build_object(''ok'',false,''state'',''expired'');';
  v_old2 text := 'v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);';
BEGIN
  IF position(v_old IN v_def) = 0 OR position(v_old2 IN v_def) = 0 THEN
    RAISE EXCEPTION 'control_device_instance_heartbeat: nie znaleziono miejsc zmiany';
  END IF;
  v_def := replace(v_def, v_old,
    'RETURN jsonb_build_object(''ok'',false,''state'',CASE WHEN v_connection.state=''replaced'' THEN ''replaced'' ELSE ''expired'' END);');
  v_def := replace(v_def, v_old2, v_old2 || chr(10) ||
    '  PERFORM public._control_device_replace_if_other_primary(p_connection_id,v_primary);');
  EXECUTE v_def;
END;
$$;

NOTIFY pgrst, 'reload schema';
