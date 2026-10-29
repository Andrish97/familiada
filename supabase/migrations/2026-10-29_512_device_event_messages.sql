-- 512: opisy zdarzeń urządzeń dla kanałów z bazy (508–511).
-- Komunikaty w statystykach i eksportach: kanał urządzenia (nie „bezpośredni”),
-- nadrobienie zmian po przerwie (resync_applied, wpływ "resync"), wymiana
-- tokenu, połączenie, zamknięcie gniazda, ponowne dołączanie, wolne
-- zastosowanie stanu; dawne nadrabianie oznaczone jako dawny mechanizm.

CREATE OR REPLACE FUNCTION "public"."_control2_device_event_view"("p_device_type" "text", "p_event_type" "text", "d" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'recovered' THEN 'Zakończyła się przerwa w kanale urządzenia; stan pobrany z bazy.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'auth_error' THEN 'Nie udało się pobrać tokenu kanału urządzenia.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'token_refresh' THEN 'Planowa wymiana tokenu kanału urządzenia.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'connected' THEN 'Kanał urządzenia połączony.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'socket_closed' THEN 'Zamknięte połączenie Realtime urządzenia.'
      WHEN p_event_type = 'transport_state' AND d->>'phase' = 'reconnect_scheduled' THEN 'Ponowne dołączanie urządzenia do kanału.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'resync_applied' THEN 'Urządzenie nadrobiło zmiany z przerwy odczytem z bazy.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_slow' THEN 'Urządzenie wolno zastosowało nowy stan.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'fallback_catchup' THEN 'Odczyt awaryjny nadrobił zmianę stanu gry (dawny mechanizm).'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'read_error' THEN 'Odczyt stanu gry z bazy nie powiódł się.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'read_recovered' THEN 'Odczyt stanu gry z bazy wrócił.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_error' THEN 'Urządzenie odebrało stan gry, ale jego obsługa renderu zgłosiła błąd.'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_recovered' THEN 'Renderowanie stanu gry wróciło do działania.'
      WHEN p_event_type = 'transport_state' THEN 'Zmienił się stan kanału urządzenia.'
      WHEN p_event_type = 'state_sync' THEN 'Urządzenie zsynchronizowało stan gry.'
      ELSE 'Zdarzenie urządzenia.' END,
    'metrics', d || jsonb_build_object('reason', p_event_type, 'impact', CASE
      WHEN p_event_type = 'transport_state' AND coalesce((d->>'catchup_count')::integer, 0) > 0 THEN 'fallback_catchup'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'resync_applied' THEN 'resync'
      WHEN p_event_type = 'transport_state' THEN 'transport_recovered'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_error' THEN 'render_failure'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'render_recovered' THEN 'render_recovered'
      WHEN p_event_type = 'state_sync' AND d->>'phase' = 'read_error' THEN 'database_read_failure'
      WHEN p_event_type = 'network_state' AND d->>'source' = 'probe' AND d->>'phase' = 'slow' THEN d->>'verdict'
      ELSE NULL END)
  )
$$;

