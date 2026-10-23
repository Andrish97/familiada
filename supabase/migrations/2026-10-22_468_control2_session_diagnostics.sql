-- 468: diagnostyka Control 2 per sesja (docs/diagnostyka-sesji-plan.md, etap 1).
--
-- Jedna tabela zdarzeń sesji zamiast dwóch magazynów:
--   * game_sessions.stats_detail.events (Control, ucinane do 100),
--   * control2_device_events (urządzenia, ucinane do 500 na grę i 30 dni).
-- Limit 3000 zdarzeń na sesję, szczegóły 90 dni, trwałe podsumowanie per
-- sesja (control2_session_diag), które nie jest ucinane. Brak kluczy obcych
-- do gier i sesji: po usunięciu gry lub konta diagnostyka zostaje dla
-- statystyk (same dane techniczne, bez treści gry) — decyzja 2026-10-22.
--
-- Przełączenie zapisu bez zmiany walidacji w RPC: wiersze wstawiane do
-- control2_device_events są przekierowywane wyzwalaczem do nowej tabeli
-- (stara tabela nie rośnie). control2_session_ping pisze wprost do nowej
-- tabeli. Stare RPC, tabela i stats_detail.events znikają w etapie 4.

ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS runtime_session_id uuid;

CREATE TABLE public.control2_session_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_session_id uuid,
  runtime_session_id uuid,
  game_id uuid,
  source text NOT NULL CHECK (source IN ('control','display','host','buzzer')),
  connection_id uuid,
  kind text NOT NULL CHECK (kind IN ('diagnostic','error','disconnect','reconnect')),
  category text,
  event_type text,
  message text,
  devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (game_session_id IS NOT NULL OR runtime_session_id IS NOT NULL)
);
CREATE INDEX control2_session_events_game_session_idx
  ON public.control2_session_events(game_session_id, created_at, id);
CREATE INDEX control2_session_events_runtime_idx
  ON public.control2_session_events(runtime_session_id, created_at)
  WHERE game_session_id IS NULL;
CREATE INDEX control2_session_events_created_idx
  ON public.control2_session_events(created_at);
CREATE UNIQUE INDEX control2_session_events_event_id_idx
  ON public.control2_session_events(game_id, event_id) WHERE event_id IS NOT NULL;

CREATE TABLE public.control2_session_diag (
  game_session_id uuid PRIMARY KEY,
  runtime_session_id uuid,
  game_id uuid,
  started_at timestamptz,
  event_count integer NOT NULL DEFAULT 0,
  dropped_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX control2_session_diag_started_idx ON public.control2_session_diag(started_at DESC);

ALTER TABLE public.control2_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control2_session_diag ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.control2_session_events, public.control2_session_diag FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
    GRANT SELECT ON public.control2_session_events, public.control2_session_diag TO agent_reader;
  END IF;
END $$;

-- Liczba z jsonb tylko, gdy to rzeczywiście liczba.
CREATE OR REPLACE FUNCTION public._control2_jnum(p jsonb, k text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN jsonb_typeof(p->k) = 'number' THEN (p->>k)::numeric END
$$;

-- Klucz podsumowania: kategoria + rodzaj zdarzenia (surowe liczniki; wnioski
-- wyciąga skrypt panelu, więc reguły można zmieniać bez migracji).
CREATE OR REPLACE FUNCTION public._control2_diag_key(p_kind text, p_category text, p_event_type text, d jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN p_kind <> 'diagnostic' THEN p_kind ELSE
    coalesce(p_category, 'other') || coalesce(':' || CASE p_category
      WHEN 'device_lease' THEN d->>'to_state'
      WHEN 'device_network' THEN d->>'phase' || CASE WHEN d->>'phase' = 'slow' THEN ':' || coalesce(d->>'verdict', '?') ELSE '' END
      WHEN 'display_state' THEN coalesce(p_event_type, d->>'reason')
        || CASE WHEN coalesce(p_event_type, d->>'reason') = 'page_state' THEN ':' || coalesce(d->>'visibility', 'unknown') ELSE '' END
      WHEN 'realtime' THEN coalesce(d->>'channel', '?') || ':' || coalesce(d->>'state', '?')
      WHEN 'audio_unlock' THEN coalesce(d->>'outcome', d->>'reason')
      WHEN 'audio_start' THEN CASE WHEN d->>'failed' = 'true' THEN 'failed' ELSE 'started' END
      WHEN 'connectivity' THEN coalesce(d->>'phase', 'outage')
      WHEN 'display_delay' THEN coalesce(d->>'reason', 'delay')
      ELSE coalesce(d->>'phase', d->>'reason', p_event_type) END, '')
  END
$$;

-- Dopisuje jedno zdarzenie do trwałego podsumowania sesji.
CREATE OR REPLACE FUNCTION public._control2_diag_bump(
  p_game_session_id uuid, p_source text, p_key text, p_at timestamptz, d jsonb, p_dropped boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_summary jsonb;
  v_cur jsonb;
  v_dur numeric := coalesce(public._control2_jnum(d, 'duration_ms'), public._control2_jnum(d, 'blocked_duration_ms'),
    public._control2_jnum(d, 'wait_ms'), public._control2_jnum(d, 'actual_ms'), 0);
  v_hidden numeric := coalesce(public._control2_jnum(d, 'hidden_duration_ms'), 0);
  v_max numeric := greatest(coalesce(public._control2_jnum(d, 'max_db_ms'), 0), coalesce(public._control2_jnum(d, 'db_ms'), 0),
    coalesce(public._control2_jnum(d, 'max_edge_ms'), 0), coalesce(public._control2_jnum(d, 'max_frame_gap_ms'), 0),
    coalesce(public._control2_jnum(d, 'fetch_ms'), 0), coalesce(public._control2_jnum(d, 'latency_ms'), 0));
BEGIN
  INSERT INTO public.control2_session_diag(game_session_id) VALUES (p_game_session_id)
    ON CONFLICT (game_session_id) DO NOTHING;
  SELECT summary INTO v_summary FROM public.control2_session_diag
    WHERE game_session_id = p_game_session_id FOR UPDATE;
  v_cur := v_summary #> ARRAY[p_source, p_key];
  IF NOT v_summary ? p_source THEN v_summary := v_summary || jsonb_build_object(p_source, '{}'::jsonb); END IF;
  v_summary := jsonb_set(v_summary, ARRAY[p_source, p_key], jsonb_build_object(
    'n', coalesce((v_cur->>'n')::integer, 0) + 1,
    'first', CASE WHEN v_cur->>'first' IS NULL OR p_at < (v_cur->>'first')::timestamptz THEN p_at ELSE (v_cur->>'first')::timestamptz END,
    'last', CASE WHEN v_cur->>'last' IS NULL OR p_at > (v_cur->>'last')::timestamptz THEN p_at ELSE (v_cur->>'last')::timestamptz END,
    'dur_ms', coalesce((v_cur->>'dur_ms')::bigint, 0) + least(86400000, greatest(0, v_dur))::bigint,
    'hidden_ms', coalesce((v_cur->>'hidden_ms')::bigint, 0) + least(86400000, greatest(0, v_hidden))::bigint,
    'max_ms', greatest(coalesce((v_cur->>'max_ms')::integer, 0), least(3600000, greatest(0, v_max))::integer)
  ));
  UPDATE public.control2_session_diag SET summary = v_summary,
    event_count = event_count + CASE WHEN p_dropped THEN 0 ELSE 1 END,
    dropped_count = dropped_count + CASE WHEN p_dropped THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE game_session_id = p_game_session_id;
END;
$$;

-- Jedyne miejsce zapisu zdarzenia sesji. Zwraca true, gdy szczegół zapisano.
CREATE OR REPLACE FUNCTION public._control2_session_event_add(
  p_game_session_id uuid, p_runtime_session_id uuid, p_game_id uuid, p_source text,
  p_connection_id uuid, p_kind text, p_category text, p_event_type text, p_message text,
  p_devices jsonb, p_details jsonb, p_event_id text, p_at timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_count integer;
  v_id bigint;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_key text := public._control2_diag_key(p_kind, p_category, p_event_type, coalesce(p_details, '{}'::jsonb));
BEGIN
  IF p_game_session_id IS NULL AND p_runtime_session_id IS NULL THEN RETURN false; END IF;
  IF p_game_session_id IS NOT NULL THEN
    SELECT event_count INTO v_count FROM public.control2_session_diag WHERE game_session_id = p_game_session_id;
  ELSE
    SELECT count(*) INTO v_count FROM (
      SELECT 1 FROM public.control2_session_events
      WHERE runtime_session_id = p_runtime_session_id AND game_session_id IS NULL LIMIT 3000
    ) x;
  END IF;
  IF coalesce(v_count, 0) >= 3000 THEN
    IF p_game_session_id IS NOT NULL THEN
      PERFORM public._control2_diag_bump(p_game_session_id, p_source, v_key, p_at, v_details, true);
    END IF;
    RETURN false;
  END IF;
  INSERT INTO public.control2_session_events(
    game_session_id, runtime_session_id, game_id, source, connection_id, kind, category,
    event_type, message, devices, details, event_id, created_at
  ) VALUES (
    p_game_session_id, p_runtime_session_id, p_game_id, p_source, p_connection_id, p_kind, p_category,
    p_event_type, left(p_message, 1000),
    CASE WHEN jsonb_typeof(p_devices) = 'array' THEN p_devices ELSE '[]'::jsonb END,
    v_details, nullif(left(p_event_id, 80), ''), p_at
  ) ON CONFLICT (game_id, event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN false; END IF;
  IF p_game_session_id IS NOT NULL THEN
    PERFORM public._control2_diag_bump(p_game_session_id, p_source, v_key, p_at, v_details, false);
  END IF;
  RETURN true;
END;
$$;

-- Kategoria, opis i metryki zdarzenia urządzenia — ten sam opis, który
-- panel dostawał dotąd z get_control2_display_events (466).
CREATE OR REPLACE FUNCTION public._control2_device_event_view(p_device_type text, p_event_type text, d jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
    'category', CASE
      WHEN p_event_type = 'lease_state' THEN 'device_lease'
      WHEN p_event_type = 'transport_state' THEN 'device_transport'
      WHEN p_event_type = 'state_sync' THEN 'device_state_sync'
      WHEN p_event_type = 'network_state' AND d->>'source' = 'probe' THEN 'device_network'
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

-- Przekierowanie: istniejące RPC urządzeń i wyzwalacz blokad wstawiają do
-- control2_device_events; wiersz trafia do nowej tabeli, stara nie rośnie.
CREATE OR REPLACE FUNCTION public._control2_device_events_forward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_view jsonb;
  v_runtime uuid;
  v_connection uuid;
BEGIN
  BEGIN
    SELECT runtime_session_id INTO v_runtime FROM public.game_sessions WHERE id = NEW.session_id;
    v_view := public._control2_device_event_view(NEW.device_type, NEW.event_type, coalesce(NEW.details, '{}'::jsonb));
    IF coalesce(NEW.details->>'connection_id', '') ~ '^[0-9a-f-]{36}$' THEN
      v_connection := (NEW.details->>'connection_id')::uuid;
    END IF;
    PERFORM public._control2_session_event_add(
      NEW.session_id, v_runtime, NEW.game_id, NEW.device_type, v_connection, 'diagnostic',
      v_view->>'category', NEW.event_type, v_view->>'message', jsonb_build_array(NEW.device_type),
      v_view->'metrics', NEW.event_id, coalesce(NEW.created_at, now()));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Control 2 session event was not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;
CREATE TRIGGER control2_device_events_forward BEFORE INSERT ON public.control2_device_events
  FOR EACH ROW EXECUTE FUNCTION public._control2_device_events_forward();

-- Zdarzenia Control: ten sam kontrakt RPC co w 395, zapis do nowej tabeli.
CREATE OR REPLACE FUNCTION public.control2_session_ping(p_game_id uuid, p_event jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE sid uuid; v_runtime uuid; event_kind text; category text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT a.session_id INTO sid
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id = a.session_id AND s.game_id = a.game_id
  WHERE a.game_id = p_game_id AND s.control_version = 2 AND s.ended_at IS NULL;
  IF sid IS NULL THEN RETURN; END IF;
  SELECT runtime_session_id INTO v_runtime FROM public.game_sessions
    WHERE id = sid AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_event IS NOT NULL THEN
    event_kind := p_event->>'kind';
    IF event_kind IS NULL OR event_kind NOT IN ('error','disconnect','reconnect','diagnostic') THEN RAISE EXCEPTION 'invalid event'; END IF;
    IF octet_length(p_event::text) > 6000 THEN RAISE EXCEPTION 'event too large'; END IF;
    IF event_kind = 'diagnostic' THEN
      category := p_event->>'category';
      IF category IS NULL OR category NOT IN ('connectivity','audio_start','audio_unlock','display_delay','state_sync','realtime') THEN
        RAISE EXCEPTION 'invalid diagnostic category';
      END IF;
    END IF;
    PERFORM public._control2_session_event_add(
      sid, v_runtime, p_game_id, 'control', NULL, event_kind, category, NULL,
      left(coalesce(p_event->>'message', ''), CASE WHEN event_kind = 'diagnostic' THEN 300 ELSE 1000 END),
      p_event->'devices',
      CASE WHEN event_kind = 'diagnostic' AND jsonb_typeof(p_event->'metrics') = 'object' THEN p_event->'metrics' ELSE '{}'::jsonb END,
      NULL, now());
  END IF;
  UPDATE public.game_sessions SET last_seen_at = now(),
    client_meta = client_meta || jsonb_build_object('error_count',
      (SELECT count(*) FROM public.control2_session_events e WHERE e.game_session_id = sid AND e.kind = 'error'))
  WHERE id = sid;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_session_ping(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control2_session_ping(uuid, jsonb) TO authenticated;

-- Nowa sesja rozgrywki: powiązanie z sesją uruchomienia Control, wiersz
-- podsumowania i dołączenie zdarzeń sprzed startu gry (przygotowanie).
CREATE OR REPLACE FUNCTION public._control2_game_session_link_runtime()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.control_version = 2 AND NEW.runtime_session_id IS NULL THEN
    SELECT r.id INTO NEW.runtime_session_id FROM public.control_runtime_sessions r
    WHERE r.game_id = NEW.game_id AND r.ended_at IS NULL AND r.expires_at > now()
    ORDER BY r.last_activity_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER game_sessions_link_runtime BEFORE INSERT ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public._control2_game_session_link_runtime();

CREATE OR REPLACE FUNCTION public._control2_game_session_diag_start()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE e record;
BEGIN
  IF NEW.control_version <> 2 THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.control2_session_diag(game_session_id, runtime_session_id, game_id, started_at)
      VALUES (NEW.id, NEW.runtime_session_id, NEW.game_id, NEW.started_at)
      ON CONFLICT (game_session_id) DO UPDATE SET runtime_session_id = EXCLUDED.runtime_session_id,
        game_id = EXCLUDED.game_id, started_at = EXCLUDED.started_at;
    IF NEW.runtime_session_id IS NOT NULL THEN
      FOR e IN UPDATE public.control2_session_events SET game_session_id = NEW.id
        WHERE runtime_session_id = NEW.runtime_session_id AND game_session_id IS NULL
        RETURNING source, kind, category, event_type, details, created_at
      LOOP
        PERFORM public._control2_diag_bump(NEW.id, e.source,
          public._control2_diag_key(e.kind, e.category, e.event_type, e.details), e.created_at, e.details, false);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Diagnostyka nie może cofnąć startu gry ani statystyk.
    RAISE WARNING 'Control 2 session diagnostics start failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER game_sessions_diag_start AFTER INSERT ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public._control2_game_session_diag_start();

-- Odczyt dla panelu admina (Worker, klucz serwisowy).
CREATE OR REPLACE FUNCTION public.get_control2_session_events(p_session_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(jsonb_object_agg(game_session_id::text, events), '{}'::jsonb)
  FROM (
    SELECT e.game_session_id, jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'kind', e.kind, 'category', e.category, 'at', e.created_at, 'message', e.message,
      'devices', e.devices, 'metrics', e.details, 'source', e.source,
      'prestart', CASE WHEN s.started_at IS NOT NULL AND e.created_at < s.started_at THEN true END
    )) ORDER BY e.created_at, e.id) AS events
    FROM public.control2_session_events e
    LEFT JOIN public.control2_session_diag s ON s.game_session_id = e.game_session_id
    WHERE e.game_session_id = ANY(coalesce(p_session_ids, '{}'::uuid[]))
    GROUP BY e.game_session_id
  ) x
$$;

CREATE OR REPLACE FUNCTION public.get_control2_session_diag(p_session_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(jsonb_object_agg(game_session_id::text, jsonb_build_object(
    'event_count', event_count, 'dropped_count', dropped_count, 'summary', summary,
    'started_at', started_at, 'has_runtime', runtime_session_id IS NOT NULL)), '{}'::jsonb)
  FROM public.control2_session_diag
  WHERE game_session_id = ANY(coalesce(p_session_ids, '{}'::uuid[]))
$$;
REVOKE ALL ON FUNCTION public.get_control2_session_events(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_control2_session_diag(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_control2_session_events(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_control2_session_diag(uuid[]) TO service_role;

-- Właściciel gry: zdarzenia własnych sesji (testy e2e statystyk Control).
CREATE OR REPLACE FUNCTION public.control2_owner_session_events(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.get_control2_session_events(ARRAY(
    SELECT id FROM public.game_sessions WHERE game_id = p_game_id AND control_version = 2));
END;
$$;
REVOKE ALL ON FUNCTION public.control2_owner_session_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control2_owner_session_events(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._control2_diag_bump(uuid, text, text, timestamptz, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._control2_session_event_add(uuid, uuid, uuid, text, uuid, text, text, text, text, jsonb, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._control2_device_events_forward() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._control2_game_session_link_runtime() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._control2_game_session_diag_start() FROM PUBLIC, anon, authenticated;

-- Retencja szczegółów: 90 dni (podsumowanie zostaje).
CREATE OR REPLACE FUNCTION public.control2_session_events_cleanup()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.control2_session_events WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_session_events_cleanup() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE v_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''control2-session-events-cleanup'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
    PERFORM cron.schedule('control2-session-events-cleanup', '23 3 * * *', 'SELECT public.control2_session_events_cleanup()');
  END IF;
END $$;

-- Przeniesienie istniejących danych.
UPDATE public.game_sessions s SET runtime_session_id = (
  SELECT r.id FROM public.control_runtime_sessions r
  WHERE r.game_id = s.game_id AND r.created_at <= s.started_at
    AND (r.ended_at IS NULL OR r.ended_at >= s.started_at)
  ORDER BY r.created_at DESC LIMIT 1)
WHERE s.control_version = 2 AND s.runtime_session_id IS NULL;

INSERT INTO public.control2_session_diag(game_session_id, runtime_session_id, game_id, started_at)
SELECT id, runtime_session_id, game_id, started_at FROM public.game_sessions WHERE control_version = 2
ON CONFLICT (game_session_id) DO NOTHING;

DO $$
DECLARE r record; v_view jsonb; n integer := 0;
BEGIN
  FOR r IN SELECT e.*, s.runtime_session_id AS rs FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id = e.session_id ORDER BY e.created_at, e.id
  LOOP
    v_view := public._control2_device_event_view(r.device_type, r.event_type, coalesce(r.details, '{}'::jsonb));
    PERFORM public._control2_session_event_add(r.session_id, r.rs, r.game_id, r.device_type,
      CASE WHEN coalesce(r.details->>'connection_id', '') ~ '^[0-9a-f-]{36}$' THEN (r.details->>'connection_id')::uuid END,
      'diagnostic', v_view->>'category', r.event_type, v_view->>'message', jsonb_build_array(r.device_type),
      v_view->'metrics', r.event_id, r.created_at);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '468: przeniesiono % zdarzeń urządzeń', n;
  n := 0;
  FOR r IN SELECT s.id, s.runtime_session_id AS rs, s.game_id, e.value AS ev
    FROM public.game_sessions s,
      jsonb_array_elements(CASE WHEN jsonb_typeof(s.stats_detail->'events') = 'array' THEN s.stats_detail->'events' ELSE '[]'::jsonb END) e
    WHERE s.control_version = 2 AND e.value->>'kind' IN ('error','disconnect','reconnect','diagnostic')
  LOOP
    PERFORM public._control2_session_event_add(r.id, r.rs, r.game_id, 'control', NULL, r.ev->>'kind',
      r.ev->>'category', NULL, r.ev->>'message', r.ev->'devices',
      CASE WHEN jsonb_typeof(r.ev->'metrics') = 'object' THEN r.ev->'metrics' ELSE '{}'::jsonb END,
      NULL, coalesce((r.ev->>'at')::timestamptz, now()));
    n := n + 1;
  END LOOP;
  RAISE NOTICE '468: przeniesiono % zdarzeń Control', n;
END $$;

NOTIFY pgrst, 'reload schema';
