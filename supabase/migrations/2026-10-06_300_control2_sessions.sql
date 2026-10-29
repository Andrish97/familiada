-- Additive: old Control RPCs, status values and historical rows stay intact.
-- Archiving Control 1 is deliberately deferred until the product migration.
ALTER TABLE public.game_sessions
  ADD COLUMN control_version smallint NOT NULL DEFAULT 1 CHECK (control_version IN (1,2)),
  ADD COLUMN start_rev bigint,
  ADD COLUMN stats_detail jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX game_sessions_control2_start_idx
  ON public.game_sessions(game_id, start_rev) WHERE control_version = 2;

CREATE OR REPLACE VIEW "public"."game_sessions_effective" WITH ("security_invoker"='true') AS
 SELECT "id",
    "game_id",
    "started_at",
    "last_seen_at",
    "ended_at",
    "status",
    "rounds_played",
    "error_message",
    "client_meta",
    "created_at",
    "winner_team",
    "team_a_score",
    "team_b_score",
    "rounds_score_a",
    "rounds_score_b",
    "final_points",
        CASE
            WHEN (("ended_at" IS NULL) AND ("status" = ANY (ARRAY['started'::"text", 'playing'::"text", 'final'::"text"])) AND (("now"() - "last_seen_at") > '01:00:00'::interval)) THEN 'abandoned'::"text"
            ELSE "status"
        END AS "effective_status",
    s.control_version, s.start_rev, s.stats_detail
   FROM "public"."game_sessions" "s";

-- Private pointer: never embed the session UUID in device-visible game_state.
CREATE TABLE public.game_session_active (
  game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE
);
ALTER TABLE public.game_session_active ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_session_active FROM anon, authenticated;

CREATE FUNCTION public.track_control2_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  sid uuid; sess public.game_sessions; d jsonb := NEW.detail;
  prev jsonb := CASE WHEN TG_OP = 'UPDATE' THEN OLD.detail ELSE '{}'::jsonb END;
  info jsonb; round_data jsonb; rn integer; a integer; b integer; fp integer;
  ra integer; rb integer; winner text; completed boolean; reason text;
  started boolean; was_started boolean; played_final boolean; final_step text;
BEGIN
  started := coalesce((d #>> '{locks,gameStarted}')::boolean, false);
  was_started := coalesce((prev #>> '{locks,gameStarted}')::boolean, false);
  SELECT s.* INTO sess FROM public.game_session_active x
    JOIN public.game_sessions s ON s.id=x.session_id WHERE x.game_id=NEW.game_id;
  sid := sess.id;

  -- Restart is observed in the same transaction as its new blank state.
  IF NOT started THEN
    IF sid IS NOT NULL AND sess.ended_at IS NULL THEN
      UPDATE public.game_sessions SET status='abandoned', ended_at=now(), last_seen_at=now(),
        stats_detail=stats_detail || '{"end_reason":"restart"}'::jsonb WHERE id=sid;
    END IF;
    DELETE FROM public.game_session_active WHERE game_id=NEW.game_id;
    RETURN NEW;
  END IF;

  -- r_intro is the ready screen. Count a play only when intro actually starts.
  IF NEW.step::text='r_intro' THEN RETURN NEW; END IF;
  IF sid IS NULL THEN
    -- Never backfill games already finished when this migration was installed.
    IF coalesce((d #>> '{locks,gameEnded}')::boolean,false) THEN RETURN NEW; END IF;
    INSERT INTO public.game_sessions(game_id, control_version, start_rev, client_meta, stats_detail)
      VALUES(NEW.game_id, 2, NEW.rev, '{"source":"control2"}',
        jsonb_build_object('teams',d->'teams','settings',d->'settings',
          'resumed_at_install', was_started AND NEW.step::text <> 'r_roundStart'))
      RETURNING * INTO sess;
    sid:=sess.id;
    INSERT INTO public.game_session_active VALUES(NEW.game_id,sid);
  END IF;
  IF sess.ended_at IS NOT NULL THEN RETURN NEW; END IF;

  a:=coalesce((d #>> '{rounds,totals,A}')::integer,0);
  b:=coalesce((d #>> '{rounds,totals,B}')::integer,0);
  fp:=coalesce((d #>> '{final,runtime,sum}')::integer,0);
  played_final:=jsonb_array_length(coalesce(d #> '{final,questions}','[]'))>0;
  completed:=coalesce((d #>> '{locks,gameEnded}')::boolean,false);
  winner:=CASE WHEN played_final THEN d #>> '{final,winnerTeam}'
    WHEN a>b THEN 'A' WHEN b>a THEN 'B' ELSE NULL END;
  ra:=a; rb:=b;
  IF played_final AND completed THEN
    IF winner='A' THEN ra:=a-fp; ELSE rb:=b-fp; END IF;
  END IF;
  info:=sess.stats_detail || jsonb_build_object('teams',d->'teams','last_step',NEW.step,
    'last_rev',NEW.rev,'final_played',played_final,
    'target_reached',coalesce((d #>> '{final,runtime,reached200}')::boolean,false));

  -- A round is counted at settlement, including a zero-point round.
  -- Showing remaining answers and entering the next round do not count again.
  IF TG_OP='UPDATE' AND OLD.step::text='r_play' AND OLD.phase::text IN ('PLAY','STEAL')
     AND (NEW.phase::text='REVEAL' OR
       coalesce((d #>> '{rounds,roundNo}')::integer,1) > coalesce((prev #>> '{rounds,roundNo}')::integer,1)) THEN
    rn:=coalesce((prev #>> '{rounds,roundNo}')::integer,1);
    round_data:=jsonb_build_object('number',rn,'question',prev #> '{rounds,question}',
      'bank',prev #> '{rounds,bankPts}', 'score_a',a,'score_b',b,
      'awarded_a',a-coalesce((prev #>> '{rounds,totals,A}')::integer,0),
      'awarded_b',b-coalesce((prev #>> '{rounds,totals,B}')::integer,0),
      'winner',CASE WHEN coalesce((prev #>> '{rounds,steal,used}')::boolean,false)
        AND coalesce((prev #>> '{rounds,steal,won}')::boolean,false)
        THEN prev #>> '{rounds,steal,team}' ELSE OLD.control_team::text END,
      'steal',prev #> '{rounds,steal}', 'x_a',prev #> '{rounds,xA}','x_b',prev #> '{rounds,xB}',
      'multiplier',coalesce((d #> '{settings,roundMultipliers}' ->> least(rn-1,
        jsonb_array_length(d #> '{settings,roundMultipliers}')-1))::integer,1));
    info:=jsonb_set(info,'{rounds}',coalesce(info->'rounds','{}') || jsonb_build_object(rn::text,round_data));
  END IF;
  IF played_final THEN
    info:=info || jsonb_build_object('final',jsonb_build_object('player1',d #> '{final,runtime,p1}',
      'player2',d #> '{final,runtime,p2}','mapping1',d #> '{final,runtime,map1}',
      'mapping2',d #> '{final,runtime,map2}','questions',d #> '{final,questions}',
      'points',fp,'target',d #> '{settings,finalTarget}'));
    final_step:=CASE
      WHEN NEW.step::text='f_end' THEN 'finished'
      WHEN NEW.step::text LIKE 'f_p1%' THEN 'p1_q' || coalesce(substring(NEW.step::text from 'q([1-5])$'), '1')
      WHEN NEW.step::text LIKE 'f_p2%' THEN 'p2_q' || coalesce(substring(NEW.step::text from 'q([1-5])$'), '1')
      ELSE 'final_start' END;
  END IF;
  IF NEW.step::text IN ('r_gameEnd','f_end') THEN
    reason:=CASE WHEN played_final THEN CASE
      WHEN coalesce((d #>> '{final,runtime,reached200}')::boolean,false) THEN 'final_target' ELSE 'final_complete' END
      WHEN greatest(ra,rb)>=coalesce((d #>> '{settings,finalMinPoints}')::integer,300) THEN 'rounds_target'
      ELSE 'questions_exhausted' END;
    info:=info || jsonb_build_object('end_reason',reason,'end_screen',d #> '{settings,endScreenMode}');
    IF played_final AND d #>> '{settings,endScreenMode}'='money' THEN
      info:=info || jsonb_build_object('prize', (greatest(ra,rb)+fp)*coalesce((d #>> '{settings,finalPrizeMultiplier}')::integer,3)
        + CASE WHEN coalesce((d #>> '{final,runtime,reached200}')::boolean,false)
          THEN coalesce((d #>> '{settings,mainPrizeAmount}')::integer,25000) ELSE 0 END);
    END IF;
  END IF;
  UPDATE public.game_sessions SET last_seen_at=now(),
    status=CASE WHEN completed THEN 'final' ELSE 'playing' END,
    ended_at=CASE WHEN completed THEN now() ELSE NULL END,
    rounds_played=(SELECT count(*) FROM jsonb_object_keys(coalesce(info->'rounds','{}'))),
    winner_team=winner, rounds_score_a=ra, rounds_score_b=rb,
    team_a_score=a, team_b_score=b, final_points=CASE WHEN played_final THEN fp ELSE NULL END,
    client_meta=client_meta || CASE WHEN final_step IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('final_step',final_step) END, stats_detail=info WHERE id=sid;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Statistics are auxiliary: they must not roll back a valid gameplay action.
  RAISE LOG 'control2 statistics failed game=% rev=%: %',NEW.game_id,NEW.rev,SQLERRM;
  RETURN NEW;
END;
$$;
CREATE TRIGGER game_state_track_session AFTER INSERT OR UPDATE OF detail, step, phase ON public.game_state
  FOR EACH ROW EXECUTE FUNCTION public.track_control2_session();
REVOKE ALL ON FUNCTION public.track_control2_session() FROM PUBLIC;

-- Only local observations need a browser call; heartbeat never alters gameplay.
CREATE FUNCTION public.control2_session_ping(p_game_id uuid, p_event jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sid uuid; item jsonb; events jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT session_id INTO sid FROM public.game_session_active WHERE game_id=p_game_id;
  IF sid IS NULL THEN RETURN; END IF;
  SELECT coalesce(stats_detail->'events','[]') INTO events FROM public.game_sessions
    WHERE id=sid AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_event IS NOT NULL THEN
    IF p_event->>'kind' NOT IN ('error','disconnect','reconnect') THEN RAISE EXCEPTION 'invalid event'; END IF;
    item:=jsonb_build_object('kind',p_event->>'kind','at',now(),
      'message',left(coalesce(p_event->>'message',''),1000),'devices',p_event->'devices');
    events:=events || jsonb_build_array(item);
    SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO events
      FROM jsonb_array_elements(events) WITH ORDINALITY e(value,ord)
      WHERE ord>jsonb_array_length(events)-100;
  END IF;
  UPDATE public.game_sessions SET last_seen_at=now(),
    stats_detail=jsonb_set(stats_detail,'{events}',events),
    client_meta=client_meta || jsonb_build_object('error_count',
      (SELECT count(*) FROM jsonb_array_elements(events) e WHERE e->>'kind'='error')) WHERE id=sid;
END;
$$;
REVOKE ALL ON FUNCTION public.control2_session_ping(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control2_session_ping(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION "public"."get_stats_detail"("p_type" "text", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

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
