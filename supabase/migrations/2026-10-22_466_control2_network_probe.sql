-- Migracja 466: pomiar łącza urządzeń w diagnostyce Control (decyzja
-- użytkownika 2026-10-22). Urządzenie mierzy dwa czasy: do Workera Cloudflare
-- (`GET https://api.familiada.online/_ping`, bez serwera) i lekkie RPC
-- `control2_net_ping` (Cloudflare + serwer + baza). Wolny pierwszy = łącze
-- urządzenia; szybki pierwszy, wolny drugi = po stronie systemu.
-- Zapisywane tylko: pomiar na starcie gry, początek spowolnienia (z werdyktem)
-- i powrót do normy. Migracja dodająca — stary kod działa bez zmian.

-- Najlżejsze RPC: przejście przez Cloudflare, PostgREST i połączenie z bazą,
-- bez odczytu danych.
CREATE OR REPLACE FUNCTION public.control2_net_ping()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.control2_net_ping() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_net_ping() TO anon, authenticated;

-- Zapis pomiaru: urządzenia (display/host/buzzer) przez klucz i lease jak
-- control2_device_transport_event, Control przez właściciela gry. Wiersz
-- event_type='network_state' (typ już dozwolony w tabeli), details.source='probe'
-- odróżnia nowe pomiary od dawnych zdarzeń network_state.
CREATE OR REPLACE FUNCTION public.control2_network_probe_event(
  p_game_id uuid, p_device_type text, p_key text, p_event jsonb,
  p_connection_id uuid DEFAULT NULL, p_epoch bigint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session_id uuid;
  v_phase text := p_event->>'phase';
  v_verdict text := p_event->>'verdict';
  v_event_id text;
  v_details jsonb;
BEGIN
  IF p_device_type = 'control' THEN
    IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSIF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public._control_device_action_valid(p_game_id, p_device_type, p_key, p_connection_id, p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_event IS NULL OR octet_length(p_event::text) > 2000 THEN RAISE EXCEPTION 'invalid event'; END IF;
  IF v_phase IS NULL OR v_phase NOT IN ('baseline','slow','recovered') THEN RAISE EXCEPTION 'invalid phase'; END IF;
  IF v_verdict IS NOT NULL AND v_verdict NOT IN ('ok','device_network','server') THEN RAISE EXCEPTION 'invalid verdict'; END IF;
  v_event_id := left(coalesce(p_event->>'event_id', ''), 80);
  IF v_event_id = '' THEN RAISE EXCEPTION 'event_id_required'; END IF;

  SELECT a.session_id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id = a.session_id AND s.game_id = a.game_id
  WHERE a.game_id = p_game_id AND s.control_version = 2 AND s.ended_at IS NULL;
  IF v_session_id IS NULL THEN RETURN false; END IF;

  -- Tylko liczby w rozsądnych granicach i znane wartości tekstowe.
  v_details := jsonb_strip_nulls(jsonb_build_object(
    'source', 'probe',
    'device_type', p_device_type,
    'phase', v_phase,
    'verdict', v_verdict,
    'edge_ms', CASE WHEN jsonb_typeof(p_event->'edge_ms') = 'number' THEN least(60000, greatest(0, (p_event->>'edge_ms')::numeric))::integer END,
    'db_ms', CASE WHEN jsonb_typeof(p_event->'db_ms') = 'number' THEN least(60000, greatest(0, (p_event->>'db_ms')::numeric))::integer END,
    'edge_failed', CASE WHEN jsonb_typeof(p_event->'edge_failed') = 'boolean' THEN (p_event->>'edge_failed')::boolean END,
    'db_failed', CASE WHEN jsonb_typeof(p_event->'db_failed') = 'boolean' THEN (p_event->>'db_failed')::boolean END,
    'max_edge_ms', CASE WHEN jsonb_typeof(p_event->'max_edge_ms') = 'number' THEN least(60000, greatest(0, (p_event->>'max_edge_ms')::numeric))::integer END,
    'max_db_ms', CASE WHEN jsonb_typeof(p_event->'max_db_ms') = 'number' THEN least(60000, greatest(0, (p_event->>'max_db_ms')::numeric))::integer END,
    'samples', CASE WHEN jsonb_typeof(p_event->'samples') = 'number' THEN least(100000, greatest(0, (p_event->>'samples')::numeric))::integer END,
    'device_network_samples', CASE WHEN jsonb_typeof(p_event->'device_network_samples') = 'number' THEN least(100000, greatest(0, (p_event->>'device_network_samples')::numeric))::integer END,
    'server_samples', CASE WHEN jsonb_typeof(p_event->'server_samples') = 'number' THEN least(100000, greatest(0, (p_event->>'server_samples')::numeric))::integer END,
    'duration_ms', CASE WHEN jsonb_typeof(p_event->'duration_ms') = 'number' THEN least(86400000, greatest(0, (p_event->>'duration_ms')::numeric))::integer END,
    'effective_type', CASE WHEN p_event->>'effective_type' IN ('slow-2g','2g','3g','4g') THEN p_event->>'effective_type' END,
    'connection_type', CASE WHEN p_event->>'connection_type' IN ('bluetooth','cellular','ethernet','none','wifi','wimax','other','unknown') THEN p_event->>'connection_type' END,
    'browser_rtt_ms', CASE WHEN jsonb_typeof(p_event->'browser_rtt_ms') = 'number' THEN least(60000, greatest(0, (p_event->>'browser_rtt_ms')::numeric))::integer END,
    'downlink_mbps', CASE WHEN jsonb_typeof(p_event->'downlink_mbps') = 'number' THEN least(10000, greatest(0, (p_event->>'downlink_mbps')::numeric)) END,
    'visibility', CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' END,
    'online', CASE WHEN jsonb_typeof(p_event->'online') = 'boolean' THEN (p_event->>'online')::boolean END
  ));

  INSERT INTO public.control2_device_events(game_id, session_id, device_type, event_type, event_id, details)
  VALUES (p_game_id, v_session_id, p_device_type, 'network_state', v_event_id, v_details)
  ON CONFLICT (game_id, event_id) WHERE event_id IS NOT NULL DO NOTHING;

  DELETE FROM public.control2_device_events e
  WHERE e.game_id = p_game_id
    AND (e.created_at < now() - interval '30 days' OR e.id IN (
      SELECT id FROM public.control2_device_events
      WHERE game_id = p_game_id ORDER BY created_at DESC, id DESC OFFSET 500
    ));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_network_probe_event(uuid,text,text,jsonb,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_network_probe_event(uuid,text,text,jsonb,uuid,bigint) TO anon, authenticated;

-- Eksport/panel: pomiary jako kategoria device_network z opisem.
CREATE OR REPLACE FUNCTION public.get_control2_display_events(p_session_ids uuid[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_object_agg(session_id::text,events),'{}'::jsonb)
  FROM (
    SELECT e.session_id,jsonb_agg(
      jsonb_build_object(
        'kind','diagnostic',
        'category',CASE
          WHEN e.event_type='lease_state' THEN 'device_lease'
          WHEN e.event_type='transport_state' THEN 'device_transport'
          WHEN e.event_type='state_sync' THEN 'device_state_sync'
          WHEN e.event_type='network_state' AND e.details->>'source'='probe' THEN 'device_network'
          ELSE 'display_state' END,
        'at',e.created_at,
        'message',CASE
          WHEN e.event_type='page_state' THEN
            'Stan karty ' || CASE e.device_type
              WHEN 'display' THEN 'Wyświetlacz'
              WHEN 'host' THEN 'Host'
              WHEN 'buzzer' THEN 'Buzzer'
              WHEN 'control' THEN 'Control'
              ELSE 'urządzenia' END || ': ' ||
            CASE e.details->>'visibility'
              WHEN 'visible' THEN 'widoczna'
              WHEN 'hidden' THEN 'w tle'
              ELSE 'nieznana' END ||
            CASE e.details->>'visibility_reason'
              WHEN 'initial' THEN ' (stan początkowy).'
              WHEN 'visibilitychange' THEN ' (zmiana widoczności).'
              ELSE '.' END
          WHEN e.event_type='network_state' AND e.details->>'source'='probe' THEN CASE
            WHEN e.details->>'phase'='baseline' THEN 'Pomiar łącza na starcie gry.'
            WHEN e.details->>'phase'='slow' AND e.details->>'verdict'='device_network' THEN 'Wolne łącze urządzenia (już do Cloudflare).'
            WHEN e.details->>'phase'='slow' AND e.details->>'verdict'='server' THEN 'Wolna odpowiedź serwera przy sprawnym łączu urządzenia.'
            WHEN e.details->>'phase'='recovered' THEN 'Łącze i odpowiedź serwera wróciły do normy.'
            ELSE 'Pomiar łącza.' END
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='waiting' THEN 'Urządzenie oczekuje na zwolnienie blokady.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='primary' THEN 'Urządzenie zostało aktywowane jako główne.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='released' THEN 'Urządzenie zwolniło blokadę.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='expired' THEN 'Blokada urządzenia wygasła.'
          WHEN e.event_type='lease_state' AND e.details->>'to_state'='revoked' THEN 'Połączenie urządzenia zostało cofnięte.'
          WHEN e.event_type='transport_state' AND e.details->>'phase'='recovered' THEN 'Zakończyła się przerwa w bezpośrednim kanale urządzenia.'
          WHEN e.event_type='transport_state' AND e.details->>'phase'='auth_error' THEN 'Nie udało się uruchomić bezpośredniego kanału urządzenia.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='fallback_catchup' THEN 'Odczyt awaryjny nadrobił zmianę stanu gry.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='read_error' THEN 'Odczyt stanu gry z bazy nie powiódł się.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='read_recovered' THEN 'Odczyt stanu gry z bazy wrócił.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_error' THEN 'Urządzenie odebrało stan gry, ale jego obsługa renderu zgłosiła błąd.'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_recovered' THEN 'Renderowanie stanu gry wróciło do działania.'
          WHEN e.event_type='transport_state' THEN 'Zmienił się stan bezpośredniego kanału urządzenia.'
          WHEN e.event_type='state_sync' THEN 'Urządzenie zsynchronizowało stan gry.'
          ELSE 'Zdarzenie urządzenia.' END,
        'devices',jsonb_build_array(e.device_type),
        'metrics',e.details||jsonb_build_object('reason',e.event_type,'impact',CASE
          WHEN e.event_type='transport_state' AND coalesce((e.details->>'catchup_count')::integer,0)>0 THEN 'fallback_catchup'
          WHEN e.event_type='transport_state' THEN 'transport_recovered'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_error' THEN 'render_failure'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='render_recovered' THEN 'render_recovered'
          WHEN e.event_type='state_sync' AND e.details->>'phase'='read_error' THEN 'database_read_failure'
          WHEN e.event_type='network_state' AND e.details->>'source'='probe' AND e.details->>'phase'='slow' THEN e.details->>'verdict'
          ELSE NULL END)
      ) ORDER BY e.created_at,e.id
    ) AS events
    FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id=e.session_id AND s.control_version=2
    WHERE e.session_id=ANY(coalesce(p_session_ids,'{}'::uuid[]))
    GROUP BY e.session_id
  ) logs;
$$;

NOTIFY pgrst, 'reload schema';
