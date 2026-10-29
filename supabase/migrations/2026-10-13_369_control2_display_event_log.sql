-- Keep sparse, useful Control 2 Display diagnostics beyond device_presence.
-- No heartbeat or personal/browser fingerprint data is stored here.
CREATE TABLE public.control2_device_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  device_type text NOT NULL DEFAULT 'display' CHECK (device_type = 'display'),
  event_type text NOT NULL CHECK (event_type IN ('page_state','render_stall','runtime_error','network_state')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX control2_device_events_game_created_idx
  ON public.control2_device_events(game_id, created_at DESC, id DESC);

ALTER TABLE public.control2_device_events ENABLE ROW LEVEL SECURITY;
-- This is internal telemetry. Neither game owners nor regular clients can
-- query the table; Admin receives it through the protected stats endpoint.
REVOKE ALL ON public.control2_device_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.control2_display_event(
  p_game_id uuid, p_key text, p_event jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  sid uuid;
  event_name text;
  event_details jsonb;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id, 'display', p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_event IS NULL OR octet_length(p_event::text) > 2000 THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  event_name := p_event->>'event_type';
  IF event_name IS NULL OR event_name NOT IN ('page_state','render_stall','runtime_error','network_state') THEN
    RAISE EXCEPTION 'invalid event type';
  END IF;

  SELECT a.session_id INTO sid
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=p_game_id AND s.control_version=2;
  IF sid IS NULL THEN RETURN; END IF;

  IF event_name='page_state' THEN
    event_details := jsonb_build_object(
      'reason', CASE WHEN p_event->>'reason' IN ('initial','visibilitychange','focus','blur') THEN p_event->>'reason' ELSE 'statechange' END,
      'visibility', CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'focused', CASE WHEN jsonb_typeof(p_event->'focused')='boolean' THEN (p_event->>'focused')::boolean ELSE NULL END,
      'was_discarded', CASE WHEN jsonb_typeof(p_event->'was_discarded')='boolean' THEN (p_event->>'was_discarded')::boolean ELSE NULL END
    );
  ELSIF event_name='render_stall' THEN
    event_details := jsonb_build_object(
      'max_frame_gap_ms', LEAST(60000, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'max_frame_gap_ms')='number' THEN (p_event->>'max_frame_gap_ms')::numeric ELSE 0 END))::integer,
      'stalled_frames', LEAST(10000, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'stalled_frames')='number' THEN (p_event->>'stalled_frames')::numeric ELSE 0 END))::integer,
      'visibility', CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'state_rev', LEAST(9223372036854775807::numeric, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint
    );
  ELSIF event_name='runtime_error' THEN
    event_details := jsonb_build_object(
      'phase', CASE WHEN p_event->>'phase' IN ('render','completion_ack') THEN p_event->>'phase' ELSE 'other' END,
      'error_name', left(coalesce(p_event->>'error_name','Error'),80),
      'state_rev', LEAST(9223372036854775807::numeric, GREATEST(0, CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint
    );
  ELSE
    event_details := jsonb_build_object(
      'online', CASE WHEN jsonb_typeof(p_event->'online')='boolean' THEN (p_event->>'online')::boolean ELSE false END
    );
  END IF;

  INSERT INTO public.control2_device_events(game_id,session_id,event_type,details)
  VALUES (p_game_id,sid,event_name,event_details);

  -- Keep the log bounded even for a frequently reused game.
  DELETE FROM public.control2_device_events e
  WHERE e.game_id=p_game_id
    AND (e.created_at < now()-interval '30 days' OR e.id IN (
      SELECT id FROM public.control2_device_events
      WHERE game_id=p_game_id ORDER BY created_at DESC,id DESC OFFSET 500
    ));
END;
$$;
REVOKE ALL ON FUNCTION public.control2_display_event(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control2_display_event(uuid,text,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_control2_display_events(p_session_ids uuid[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(session_id::text, events), '{}'::jsonb)
  FROM (
    SELECT e.session_id, jsonb_agg(
      jsonb_build_object(
        'kind','diagnostic',
        'category','display_state',
        'at',e.created_at,
        'message','Zdarzenie urządzenia Wyświetlacz.',
        'devices',jsonb_build_array('display'),
        'metrics',e.details || jsonb_build_object('reason',e.event_type)
      ) ORDER BY e.created_at,e.id
    ) AS events
    FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id=e.session_id AND s.control_version=2
    WHERE e.session_id=ANY(coalesce(p_session_ids,'{}'::uuid[]))
    GROUP BY e.session_id
  ) logs;
$$;
REVOKE ALL ON FUNCTION public.get_control2_display_events(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_control2_display_events(uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';


-- Give the protected Admin stats RPC an internal key for log enrichment.
-- The Worker removes this key before returning rows to the browser.
CREATE OR REPLACE FUNCTION public.get_stats_detail(p_type text, p_limit integer DEFAULT 200) RETURNS jsonb
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  CASE p_type

  WHEN 'users' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        p.username,
        p.email,
        lower(u.raw_user_meta_data->>'language') AS language,
        p.is_guest,
        p.created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE NOT (p.id = ANY(excluded_ids))
      ORDER BY p.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'games' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name,
        g.type,
        g.status,
        pr.username AS owner,
        g.created_at
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE g.is_demo = false
        AND g.source_market_id IS NULL
        AND NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'custom_settings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name AS game_name,
        pr.username AS owner,
        g.created_at,
        g.settings->'game'->'advanced' AS advanced,
        g.settings->'display' AS display,
        g.settings->'game'->>'hasFinal' AS has_final,
        g.settings->'game'->>'finalQuestionsMode' AS final_questions_mode,
        g.settings->'game'->>'roundsQuestionsMode' AS rounds_questions_mode,
        g.settings->'sound' AS sound
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE NOT (g.owner_id = ANY(excluded_ids))
        AND (
          (g.settings->'game'->'advanced' IS NOT NULL
            AND g.settings->'game'->'advanced' <> '{}'::jsonb
            AND g.settings->'game'->'advanced' <> '{"roundMultipliers":[1,1,1,2,3],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"logo","finalPrizeMultiplier":3,"mainPrizeAmount":25000}'::jsonb)
          OR (g.settings->'display'->'colors' IS NOT NULL
            AND g.settings->'display'->'colors' <> '{"A":"#c4002f","B":"#2a62ff","BACKGROUND":"#d21180","DOT":"#d7ff3d"}'::jsonb)
          OR (g.settings->'display'->>'theme' IS NOT NULL)
          OR (g.settings->'display'->>'logoId' IS NOT NULL)
          OR (g.settings->'game'->>'hasFinal' IS NOT NULL)
          OR (g.settings->'game'->>'finalQuestionsMode' IS NOT NULL AND g.settings->'game'->>'finalQuestionsMode' <> 'random')
          OR (g.settings->'game'->>'roundsQuestionsMode' IS NOT NULL AND g.settings->'game'->>'roundsQuestionsMode' <> 'random')
          OR EXISTS (
            SELECT 1 FROM jsonb_each_text(COALESCE(g.settings->'sound'->'variants', '{}'::jsonb)) v
            WHERE v.value = '__custom__'
          )
        )
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'gameplay' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        s.id AS session_id,
        g.name AS game_name,
        pr.username AS owner,
        s.control_version,
        s.stats_detail,
        s.started_at,
        s.ended_at,
        s.status,
        s.effective_status,
        s.rounds_played,
        s.winner_team,
        s.team_a_score,
        s.team_b_score,
        s.rounds_score_a,
        s.rounds_score_b,
        s.final_points,
        s.client_meta->>'final_step' AS final_step,
        COALESCE((s.client_meta->>'error_count')::int, 0) AS error_count
      FROM public.game_sessions_effective s
      JOIN public.games g ON g.id = s.game_id
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY s.started_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'bases' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        b.name,
        pr.username AS owner,
        b.created_at
      FROM public.question_bases b
      LEFT JOIN public.profiles pr ON pr.id = b.owner_id
      WHERE b.is_demo = false
        AND NOT (b.owner_id = ANY(excluded_ids))
      ORDER BY b.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'logos' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        l.name,
        l.type,
        pr.username AS owner,
        l.created_at
      FROM public.user_logos l
      LEFT JOIN public.profiles pr ON pr.id = l.user_id
      WHERE l.is_demo = false
        AND NOT (l.user_id = ANY(excluded_ids))
      ORDER BY l.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'ratings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        pr.username,
        rt.stars,
        rt.comment,
        rt.created_at
      FROM public.app_ratings rt
      LEFT JOIN public.profiles pr ON pr.id = rt.user_id
      ORDER BY rt.created_at DESC
      LIMIT p_limit
    ) r;

  ELSE
    result := '[]'::jsonb;
  END CASE;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_stats_detail(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stats_detail(text,integer) TO service_role;
