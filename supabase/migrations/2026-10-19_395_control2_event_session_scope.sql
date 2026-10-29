-- Keep Control 2 diagnostics inside the lifetime of the active game session.
-- Old Control tabs may still report late channel diagnostics after the game ended;
-- never attach those reports to an ended session.
CREATE OR REPLACE FUNCTION public.control2_session_ping(p_game_id uuid, p_event jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid; item jsonb; events jsonb; event_kind text; category text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT a.session_id INTO sid
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=p_game_id AND s.control_version=2 AND s.ended_at IS NULL;
  IF sid IS NULL THEN RETURN; END IF;
  SELECT coalesce(stats_detail->'events','[]') INTO events
    FROM public.game_sessions WHERE id=sid AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_event IS NOT NULL THEN
    event_kind:=p_event->>'kind';
    IF event_kind IS NULL OR event_kind NOT IN ('error','disconnect','reconnect','diagnostic') THEN RAISE EXCEPTION 'invalid event'; END IF;
    IF octet_length(p_event::text)>6000 THEN RAISE EXCEPTION 'event too large'; END IF;
    IF event_kind='diagnostic' THEN
      category:=p_event->>'category';
      IF category IS NULL OR category NOT IN ('connectivity','audio_start','display_delay','state_sync','realtime') THEN RAISE EXCEPTION 'invalid diagnostic category'; END IF;
      item:=jsonb_build_object('kind',event_kind,'category',category,'at',now(),
        'message',left(coalesce(p_event->>'message',''),300),
        'devices',CASE WHEN jsonb_typeof(p_event->'devices')='array' THEN p_event->'devices' ELSE '[]'::jsonb END,
        'metrics',CASE WHEN jsonb_typeof(p_event->'metrics')='object' THEN p_event->'metrics' ELSE '{}'::jsonb END);
    ELSE
      item:=jsonb_build_object('kind',event_kind,'at',now(),
        'message',left(coalesce(p_event->>'message',''),1000),'devices',p_event->'devices');
    END IF;
    events:=events || jsonb_build_array(item);
    WITH expanded AS (
      SELECT value,ord,
        CASE WHEN value->>'kind'='diagnostic'
          AND value->>'category'='realtime'
          AND value#>>'{metrics,phase}'='game_start'
          AND value#>>'{metrics,channel}' IN ('display_completion','display_transition_started')
          THEN value#>>'{metrics,channel}' END AS pinned_channel
      FROM jsonb_array_elements(events) WITH ORDINALITY e(value,ord)
    ), pinned AS (
      SELECT value,ord,row_number() OVER (PARTITION BY pinned_channel ORDER BY ord DESC) AS channel_rank
      FROM expanded WHERE pinned_channel IS NOT NULL
    ), regular AS (
      SELECT value,ord,row_number() OVER (ORDER BY ord DESC) AS recent_rank
      FROM expanded WHERE pinned_channel IS NULL
    ), kept AS (
      SELECT value,ord FROM pinned WHERE channel_rank=1
      UNION ALL
      SELECT r.value,r.ord FROM regular r
      WHERE r.recent_rank <= greatest(0,100-(SELECT count(*) FROM pinned WHERE channel_rank=1))
    )
    SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO events FROM kept;
  END IF;
  UPDATE public.game_sessions SET last_seen_at=now(),
    stats_detail=jsonb_set(stats_detail,'{events}',events),
    client_meta=client_meta || jsonb_build_object('error_count',
      (SELECT count(*) FROM jsonb_array_elements(events) e WHERE e->>'kind'='error')) WHERE id=sid;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_session_ping(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control2_session_ping(uuid,jsonb) TO authenticated;

-- Remove late game-start channel snapshots already misattributed to finished
-- sessions by the old RPC behavior. Other diagnostic history is preserved.
UPDATE public.game_sessions s
SET stats_detail=jsonb_set(
  coalesce(s.stats_detail,'{}'::jsonb),
  '{events}',
  coalesce((
    SELECT jsonb_agg(e.value ORDER BY e.ord)
    FROM jsonb_array_elements(coalesce(s.stats_detail->'events','[]'::jsonb))
      WITH ORDINALITY e(value,ord)
    WHERE NOT (
      e.value->>'kind'='diagnostic'
      AND e.value->>'category'='realtime'
      AND e.value#>>'{metrics,phase}'='game_start'
      AND coalesce(e.value->>'at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      AND (e.value->>'at')::timestamptz > s.ended_at
    )
  ),'[]'::jsonb),true)
WHERE s.control_version=2 AND s.ended_at IS NOT NULL
  AND jsonb_typeof(s.stats_detail->'events')='array';

-- Produce device-specific messages in JSON exports instead of labelling every
-- page visibility event as a Display event. The structured metrics are unchanged.
CREATE OR REPLACE FUNCTION public.get_control2_display_events(p_session_ids uuid[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(session_id::text,events),'{}'::jsonb)
  FROM (
    SELECT e.session_id,jsonb_agg(
      jsonb_build_object(
        'kind','diagnostic',
        'category',CASE
          WHEN e.event_type='lease_state' THEN 'device_lease'
          WHEN e.event_type='transport_state' THEN 'device_transport'
          WHEN e.event_type='state_sync' THEN 'device_state_sync'
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
          ELSE NULL END)
      ) ORDER BY e.created_at,e.id
    ) AS events
    FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id=e.session_id AND s.control_version=2
    WHERE e.session_id=ANY(coalesce(p_session_ids,'{}'::uuid[]))
    GROUP BY e.session_id
  ) logs;
$$;
REVOKE ALL ON FUNCTION public.get_control2_display_events(uuid[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_control2_display_events(uuid[])
  TO service_role;
NOTIFY pgrst,'reload schema';
