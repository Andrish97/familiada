-- Keep the initial state of the two realtime channels in long Control 2 runs.
-- The event stream stays bounded at 100 entries; the two startup snapshots
-- reserve at most two slots and the remaining entries are the newest events.
CREATE OR REPLACE FUNCTION public.control2_session_ping(p_game_id uuid, p_event jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid; item jsonb; events jsonb; event_kind text; category text; session_ended boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT session_id INTO sid FROM public.game_session_active WHERE game_id=p_game_id;
  IF sid IS NULL THEN RETURN; END IF;
  SELECT coalesce(stats_detail->'events','[]'), ended_at IS NOT NULL INTO events, session_ended
    FROM public.game_sessions WHERE id=sid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF session_ended AND coalesce(p_event->>'kind','') <> 'diagnostic' THEN RETURN; END IF;
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
  UPDATE public.game_sessions SET last_seen_at=CASE WHEN ended_at IS NULL THEN now() ELSE last_seen_at END,
    stats_detail=jsonb_set(stats_detail,'{events}',events),
    client_meta=client_meta || jsonb_build_object('error_count',
      (SELECT count(*) FROM jsonb_array_elements(events) e WHERE e->>'kind'='error')) WHERE id=sid;
END;
$$;
NOTIFY pgrst,'reload schema';
