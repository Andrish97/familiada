-- 469: jedno RPC zapisu diagnostyki dla urządzeń i jedno dla Control
-- (docs/diagnostyka-sesji-plan.md, etap 2). Zdarzenia przed startem gry
-- trafiają do sesji uruchomienia Control i dołączają się do sesji rozgrywki
-- przy starcie (468). Nowe sygnały: page_lifecycle (freeze/resume, pagehide/
-- pageshow, online/offline), wake_lock, device_info. Stare RPC zostają do
-- etapu 4 (otwarte karty ze starym kodem).

-- Wartości z klienta: tylko liczby, wartości logiczne i krótkie tokeny
-- (bez spacji i znaków spoza listy), najwyżej 40 kluczy.
CREATE OR REPLACE FUNCTION public._control2_sanitize_event(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(jsonb_object_agg(key, CASE jsonb_typeof(value)
      WHEN 'number' THEN to_jsonb(trim_scale(least(9000000000000000::numeric, greatest(-9000000000000000::numeric, round((value #>> '{}')::numeric, 3)))))
      ELSE value END), '{}'::jsonb)
  FROM (
    SELECT key, value FROM jsonb_each(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END)
    WHERE key ~ '^[a-z][a-z0-9_]{0,39}$' AND key NOT IN ('event_id', 'event_type')
      AND (jsonb_typeof(value) IN ('number', 'boolean')
        OR (jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '^[A-Za-z0-9_.:/+-]{0,80}$'))
    ORDER BY key LIMIT 40
  ) x
$$;

-- Widok zdarzenia urządzenia (468) rozszerzony o nowe sygnały.
CREATE OR REPLACE FUNCTION public._control2_device_event_view(p_device_type text, p_event_type text, d jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
    'category', CASE
      WHEN p_event_type = 'lease_state' THEN 'device_lease'
      WHEN p_event_type = 'transport_state' THEN 'device_transport'
      WHEN p_event_type = 'state_sync' THEN 'device_state_sync'
      WHEN p_event_type = 'network_state' AND d->>'source' = 'probe' THEN 'device_network'
      WHEN p_event_type = 'page_lifecycle' THEN 'page_lifecycle'
      WHEN p_event_type = 'wake_lock' THEN 'wake_lock'
      WHEN p_event_type = 'device_info' THEN 'device_info'
      ELSE 'display_state' END,
    'message', CASE
      WHEN p_event_type = 'page_state' THEN
        'Stan karty ' || CASE p_device_type
          WHEN 'display' THEN 'Wyświetlacz' WHEN 'host' THEN 'Host' WHEN 'buzzer' THEN 'Buzzer'
          WHEN 'control' THEN 'Control' ELSE 'urządzenia' END || ': ' ||
        CASE d->>'visibility' WHEN 'visible' THEN 'widoczna' WHEN 'hidden' THEN 'w tle' ELSE 'nieznana' END ||
        CASE d->>'visibility_reason' WHEN 'initial' THEN ' (stan początkowy).'
          WHEN 'visibilitychange' THEN ' (zmiana widoczności).' ELSE '.' END
      WHEN p_event_type = 'network_state' AND d->>'source' = 'probe' THEN CASE
        WHEN d->>'phase' = 'baseline' THEN 'Pomiar łącza na starcie gry.'
        WHEN d->>'phase' = 'slow' AND d->>'verdict' = 'device_network' THEN 'Wolne łącze urządzenia (już do Cloudflare).'
        WHEN d->>'phase' = 'slow' AND d->>'verdict' = 'server' THEN 'Wolna odpowiedź serwera przy sprawnym łączu urządzenia.'
        WHEN d->>'phase' = 'recovered' THEN 'Łącze i odpowiedź serwera wróciły do normy.'
        ELSE 'Pomiar łącza.' END
      WHEN p_event_type = 'page_lifecycle' THEN CASE d->>'phase'
        WHEN 'freeze' THEN 'Przeglądarka zamroziła stronę.'
        WHEN 'resume' THEN 'Strona wznowiona po zamrożeniu.'
        WHEN 'pagehide' THEN 'Strona zamknięta lub przeładowana.'
        WHEN 'pageshow' THEN 'Strona przywrócona z pamięci przeglądarki.'
        WHEN 'offline' THEN 'Przeglądarka zgłosiła brak sieci.'
        WHEN 'online' THEN 'Przeglądarka zgłosiła powrót sieci.'
        ELSE 'Zmiana stanu strony.' END
      WHEN p_event_type = 'wake_lock' THEN CASE d->>'phase'
        WHEN 'granted' THEN 'Blokada wygaszania ekranu włączona.'
        WHEN 'denied' THEN 'Przeglądarka odmówiła blokady wygaszania ekranu.'
        WHEN 'unsupported' THEN 'Przeglądarka nie obsługuje blokady wygaszania ekranu.'
        WHEN 'released' THEN 'System zwolnił blokadę wygaszania ekranu.'
        ELSE 'Blokada wygaszania ekranu.' END
      WHEN p_event_type = 'device_info' THEN 'Urządzenie i przeglądarka.'
      WHEN p_event_type = 'lease_state' AND d->>'to_state' = 'waiting' THEN 'Urządzenie oczekuje na zwolnienie blokady.'
      WHEN p_event_type = 'lease_state' AND d->>'to_state' = 'primary' THEN 'Urządzenie zostało aktywowane jako główne.'
      WHEN p_event_type = 'lease_state' AND d->>'to_state' = 'released' THEN 'Urządzenie zwolniło blokadę.'
      WHEN p_event_type = 'lease_state' AND d->>'to_state' = 'expired' THEN 'Blokada urządzenia wygasła.'
      WHEN p_event_type = 'lease_state' AND d->>'to_state' = 'revoked' THEN 'Połączenie urządzenia zostało cofnięte.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'recovered' THEN 'Zakończyła się przerwa w bezpośrednim kanale urządzenia.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'auth_error' THEN 'Nie udało się uruchomić bezpośredniego kanału urządzenia.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'fallback_catchup' THEN 'Odczyt awaryjny nadrobił zmianę stanu gry.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'read_error' THEN 'Odczyt stanu gry z bazy nie powiódł się.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'read_recovered' THEN 'Odczyt stanu gry z bazy wrócił.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_error' THEN 'Urządzenie odebrało stan gry, ale jego obsługa renderu zgłosiła błąd.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_recovered' THEN 'Renderowanie stanu gry wróciło do działania.'
      WHEN p_event_type = 'transport_state' THEN 'Zmienił się stan bezpośredniego kanału urządzenia.'
      WHEN p_event_type = 'state_sync' THEN 'Urządzenie zsynchronizowało stan gry.'
      ELSE 'Zdarzenie urządzenia.' END,
    'metrics', d || jsonb_build_object('reason', p_event_type, 'impact', CASE
      WHEN p_event_type = 'transport_state' AND coalesce((d->>'catchup_count')::integer, 0) > 0 THEN 'fallback_catchup'
      WHEN p_event_type = 'transport_state' THEN 'transport_recovered'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_error' THEN 'render_failure'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_recovered' THEN 'render_recovered'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'read_error' THEN 'database_read_failure'
      WHEN p_event_type = 'network_state' AND d->>'source' = 'probe' AND d->>'phase' = 'slow' THEN d->>'verdict'
      ELSE NULL END)
  )
$$;

-- Zapis jednego zdarzenia typu urządzenia (także Control jako źródło).
CREATE OR REPLACE FUNCTION public._control2_log_typed(
  p_game_session_id uuid, p_runtime_session_id uuid, p_game_id uuid, p_source text,
  p_connection_id uuid, p_event jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_type text := p_event->>'event_type';
  v_details jsonb;
  v_view jsonb;
BEGIN
  IF v_type IS NULL OR v_type NOT IN ('page_state','transport_state','state_sync','network_state',
      'render_stall','runtime_error','page_lifecycle','wake_lock','device_info') THEN
    RETURN false;
  END IF;
  v_details := public._control2_sanitize_event(p_event) || jsonb_build_object('device_type', p_source);
  IF v_type = 'page_state' THEN
    v_details := (v_details - 'reason') || jsonb_build_object('visibility_reason', p_event->>'reason');
  END IF;
  v_view := public._control2_device_event_view(p_source, v_type, v_details);
  RETURN public._control2_session_event_add(p_game_session_id, p_runtime_session_id, p_game_id, p_source,
    p_connection_id, 'diagnostic', v_view->>'category', v_type, v_view->>'message',
    jsonb_build_array(p_source), v_view->'metrics', p_event->>'event_id', now());
END;
$$;

CREATE OR REPLACE FUNCTION public._control2_active_game_session(p_game_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT a.session_id FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id = a.session_id AND s.game_id = a.game_id
  WHERE a.game_id = p_game_id AND s.control_version = 2 AND s.ended_at IS NULL
  LIMIT 1
$$;

-- Urządzenia: paczka do 20 zdarzeń, tylko główna instancja (lease).
CREATE OR REPLACE FUNCTION public.control2_device_log(
  p_game_id uuid, p_device_type text, p_key text, p_connection_id uuid, p_epoch bigint, p_events jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_runtime uuid;
  v_game_session uuid;
  v_event jsonb;
  n integer := 0;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public._control_device_action_valid(p_game_id, p_device_type, p_key, p_connection_id, p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 20 OR octet_length(p_events::text) > 20000 THEN
    RAISE EXCEPTION 'invalid events';
  END IF;
  v_runtime := public._control_device_session_for_key(p_game_id, p_device_type, p_key);
  v_game_session := public._control2_active_game_session(p_game_id);
  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(v_event) = 'object' AND octet_length(v_event::text) <= 2000
       AND public._control2_log_typed(v_game_session, v_runtime, p_game_id, p_device_type, p_connection_id, v_event) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_device_log(uuid, text, text, uuid, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_device_log(uuid, text, text, uuid, bigint, jsonb) TO anon, authenticated;

-- Control (właściciel gry): obserwacje Control ({kind, category, ...}) i
-- zdarzenia typu urządzenia ({event_type, ...}) w jednej paczce.
CREATE OR REPLACE FUNCTION public.control2_control_log(p_game_id uuid, p_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_runtime uuid;
  v_game_session uuid;
  v_event jsonb;
  v_kind text;
  v_category text;
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 20 OR octet_length(p_events::text) > 40000 THEN
    RAISE EXCEPTION 'invalid events';
  END IF;
  v_game_session := public._control2_active_game_session(p_game_id);
  SELECT coalesce((SELECT runtime_session_id FROM public.game_sessions WHERE id = v_game_session),
    (SELECT r.id FROM public.control_runtime_sessions r
     WHERE r.game_id = p_game_id AND r.ended_at IS NULL AND r.expires_at > now()
     ORDER BY r.last_activity_at DESC LIMIT 1)) INTO v_runtime;
  IF v_game_session IS NULL AND v_runtime IS NULL THEN RETURN 0; END IF;
  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    CONTINUE WHEN jsonb_typeof(v_event) <> 'object' OR octet_length(v_event::text) > 6000;
    v_kind := v_event->>'kind';
    IF v_kind IS NOT NULL THEN
      CONTINUE WHEN v_kind NOT IN ('error','disconnect','reconnect','diagnostic');
      v_category := v_event->>'category';
      CONTINUE WHEN v_kind = 'diagnostic' AND (v_category IS NULL OR v_category NOT IN
        ('connectivity','audio_start','audio_unlock','display_delay','state_sync','realtime'));
      IF public._control2_session_event_add(v_game_session, v_runtime, p_game_id, 'control', NULL, v_kind,
          CASE WHEN v_kind = 'diagnostic' THEN v_category END, NULL,
          left(coalesce(v_event->>'message', ''), CASE WHEN v_kind = 'diagnostic' THEN 300 ELSE 1000 END),
          v_event->'devices',
          CASE WHEN v_kind = 'diagnostic' AND jsonb_typeof(v_event->'metrics') = 'object' THEN v_event->'metrics' ELSE '{}'::jsonb END,
          v_event->>'event_id', now()) THEN
        n := n + 1;
      END IF;
    ELSIF public._control2_log_typed(v_game_session, v_runtime, p_game_id, 'control', NULL, v_event) THEN
      n := n + 1;
    END IF;
  END LOOP;
  IF v_game_session IS NOT NULL AND n > 0 THEN
    UPDATE public.game_sessions SET last_seen_at = now(),
      client_meta = client_meta || jsonb_build_object('error_count',
        (SELECT count(*) FROM public.control2_session_events e WHERE e.game_session_id = v_game_session AND e.kind = 'error'))
    WHERE id = v_game_session;
  END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_control_log(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control2_control_log(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public._control2_log_typed(uuid, uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._control2_active_game_session(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
