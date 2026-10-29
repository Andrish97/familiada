-- Control 2: atomowy stan urządzeń (docs/plan-control2-realtime-i-blokad-urzadzen.md,
-- sekcja „Atomowy stan urządzeń”).
--
-- 1. Odblokowanie dźwięku jest cechą instancji Wyświetlacza w lease:
--    control_device_connections.audio_unlocked ustawia heartbeat głównej
--    instancji (p_meta.audio_unlocked) z fencingiem connection_id/epoch.
--    Nowa instancja zaczyna od false, więc odblokowanie nie przenosi się na
--    przeładowany ani podmieniony Wyświetlacz.
-- 2. Heartbeat głównej instancji zapisuje też device_presence (statystyki,
--    aktywność serwisowa, diagnostyka), więc urządzenia nie wysyłają już
--    osobnego device_ping.
-- 3. control_devices_snapshot: jeden odczyt Control w jednej migawce bazy.
--
-- Migracja dodaje kolumnę i funkcje; stare RPC (device_ping, odblokowanie
-- przez nonce) zostają do czasu wdrożenia nowego klienta i usunięcia osobną
-- migracją.

ALTER TABLE public.control_device_connections
  ADD COLUMN audio_unlocked boolean NOT NULL DEFAULT false;

-- Wiersz device_presence zapisywany przez heartbeat głównej instancji.
-- Stały identyfikator: jeden wiersz na grę i typ, nadpisywany przy każdym
-- heartbeacie (przeładowania nie mnożą wierszy).
CREATE OR REPLACE FUNCTION public.control_device_instance_heartbeat(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid,
  p_epoch bigint, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_session_id uuid;
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_primary uuid;
  v_meta jsonb := CASE WHEN jsonb_typeof(p_meta)='object' AND octet_length(p_meta::text)<=4000
    THEN p_meta ELSE '{}'::jsonb END;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','missing'); END IF;
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND OR v_connection.state NOT IN ('waiting','primary') THEN
    RETURN jsonb_build_object('ok',false,'state','expired');
  END IF;

  IF v_connection.state='primary' AND v_slot.primary_connection_id=p_connection_id
     AND v_slot.epoch=p_epoch AND v_slot.lease_expires_at>clock_timestamp() THEN
    UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN v_meta->>'visibility' IN ('visible','hidden') THEN v_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(v_meta->'focused')='boolean' THEN (v_meta->>'focused')::boolean ELSE NULL END,
      received_rev=GREATEST(received_rev,CASE WHEN coalesce(v_meta->>'received_rev','') ~ '^[0-9]{1,18}$' THEN (v_meta->>'received_rev')::bigint ELSE received_rev END),
      rendered_rev=GREATEST(rendered_rev,CASE WHEN coalesce(v_meta->>'rendered_rev','') ~ '^[0-9]{1,18}$' THEN (v_meta->>'rendered_rev')::bigint ELSE rendered_rev END),
      started_sound_cue_seq=GREATEST(started_sound_cue_seq,CASE WHEN coalesce(v_meta->>'started_sound_cue_seq','') ~ '^[0-9]{1,18}$' THEN (v_meta->>'started_sound_cue_seq')::bigint ELSE started_sound_cue_seq END),
      audio_unlocked=CASE WHEN p_device_type='display' AND jsonb_typeof(v_meta->'audio_unlocked')='boolean'
        THEN (v_meta->>'audio_unlocked')::boolean ELSE audio_unlocked END
    WHERE id=p_connection_id;
    UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp()+interval '12 seconds',
      updated_at=clock_timestamp() WHERE session_id=v_session_id AND device_type=p_device_type;
    INSERT INTO public.device_presence(game_id,device_type,device_id,last_seen_at,meta)
    VALUES(p_game_id,p_device_type::public.device_type,'lease-primary',now(),v_meta)
    ON CONFLICT(game_id,device_type,device_id) DO UPDATE
      SET last_seen_at=excluded.last_seen_at,meta=excluded.meta;
  ELSIF v_connection.state='primary' THEN
    UPDATE public.control_device_connections SET state='waiting',epoch=NULL,audio_unlocked=false,
      requested_at=clock_timestamp(),last_seen_at=clock_timestamp()
    WHERE id=p_connection_id;
  ELSE
    UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN v_meta->>'visibility' IN ('visible','hidden') THEN v_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(v_meta->'focused')='boolean' THEN (v_meta->>'focused')::boolean ELSE NULL END,
      received_rev=GREATEST(received_rev,CASE WHEN coalesce(v_meta->>'received_rev','') ~ '^[0-9]{1,18}$' THEN (v_meta->>'received_rev')::bigint ELSE received_rev END),
      rendered_rev=GREATEST(rendered_rev,CASE WHEN coalesce(v_meta->>'rendered_rev','') ~ '^[0-9]{1,18}$' THEN (v_meta->>'rendered_rev')::bigint ELSE rendered_rev END),
      started_sound_cue_seq=GREATEST(started_sound_cue_seq,CASE WHEN coalesce(v_meta->>'started_sound_cue_seq','') ~ '^[0-9]{1,18}$' THEN (v_meta->>'started_sound_cue_seq')::bigint ELSE started_sound_cue_seq END)
    WHERE id=p_connection_id;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id,
      'audio_unlocked',(SELECT c.audio_unlocked FROM public.control_device_connections c WHERE c.id=p_connection_id));
END;
$$;

COMMENT ON FUNCTION public.control_device_instance_heartbeat(uuid,text,text,uuid,bigint,jsonb) IS
  'Renews an instance lease, records client progress and Display audio unlock for the fenced primary, and keeps device_presence for statistics.';

-- Jeden odczyt Control: lease, obecność, postęp i odblokowanie dźwięku w
-- jednej migawce (funkcja STABLE używa migawki zapytania wywołującego).
CREATE OR REPLACE FUNCTION public.control_devices_snapshot(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_devices jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT coalesce(jsonb_object_agg(s.device_type, jsonb_build_object(
      'primary_online', s.primary_connection_id IS NOT NULL AND s.lease_expires_at>clock_timestamp()
        AND c.id IS NOT NULL AND c.last_seen_at>clock_timestamp()-interval '12 seconds',
      'waiting_count', (SELECT count(*)::integer FROM public.control_device_connections w
        WHERE w.session_id=s.session_id AND w.device_type=s.device_type AND w.state='waiting'
          AND w.last_seen_at>clock_timestamp()-interval '12 seconds'),
      'lease_expires_at', s.lease_expires_at,
      'last_seen_at', c.last_seen_at,
      'visibility', c.page_visibility,
      'focused', c.focused,
      'received_rev', c.received_rev,
      'rendered_rev', c.rendered_rev,
      'audio_unlocked', coalesce(c.audio_unlocked,false),
      'meta', coalesce(dp.meta,'{}'::jsonb)
    )), '{}'::jsonb)
  INTO v_devices
  FROM public.control_device_slots s
  JOIN public.control_runtime_sessions r ON r.id=s.session_id
  LEFT JOIN public.control_device_connections c
    ON c.id=s.primary_connection_id AND c.state='primary' AND c.epoch=s.epoch
  LEFT JOIN public.device_presence dp
    ON dp.game_id=s.game_id AND dp.device_type::text=s.device_type AND dp.device_id='lease-primary'
  WHERE s.game_id=p_game_id AND r.ended_at IS NULL AND r.expires_at>now();
  RETURN jsonb_build_object('ok',true,'server_time',clock_timestamp(),'devices',v_devices);
END;
$$;
REVOKE ALL ON FUNCTION public.control_devices_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_devices_snapshot(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
