-- 484: control_devices_snapshot zwraca też rewizję gry i potwierdzenie
-- Wyświetlacza (badanie Control na słabym łączu, 25.10). Control odpytuje tę
-- migawkę co 750 ms, a o naciśnięciu Przycisku dowiadywał się wyłącznie
-- z dzwonka Realtime — zgubiony broadcast (np. przy chwilowym zerwaniu
-- gniazda) zostawiał Control bez zgłoszenia. Nowe klucze są dodatkowe;
-- dotychczasowy Control je pomija.

CREATE OR REPLACE FUNCTION "public"."control_devices_snapshot"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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
  -- 484: rewizja gry i potwierdzenie Wyświetlacza w tej samej migawce, którą
  -- Control odpytuje co 750 ms — siatka na zgubiony dzwonek (naciśnięcie
  -- Przycisku) i zgubione potwierdzenie planszy, bez osobnych zapytań.
  RETURN jsonb_build_object('ok',true,'server_time',clock_timestamp(),'devices',v_devices,
    'game_rev',(SELECT rev FROM public.game_state WHERE game_id=p_game_id),
    'display_completion',(SELECT jsonb_build_object('rendered_rev',dc.rendered_rev,'requested_rev',dc.requested_rev,
        'rendered_at',dc.rendered_at,'requested_at',dc.requested_at)
      FROM public.game_state_display_completion dc WHERE dc.game_id=p_game_id));
END;
$$;
