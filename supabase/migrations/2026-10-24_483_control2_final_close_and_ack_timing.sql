-- 483: statystyki Control 2 i potwierdzenia Wyświetlacza (eksport 24.10).
-- 1) Finał doszedł do f_end, a operator nie nacisnął „Zakończ” i zamknął
--    strony: bezczynność, restart albo anulowanie z ustawień liczyły to jako
--    porzuconą grę, bez punktów finału w wyniku drużyny. Teraz taka sesja
--    zamyka się jako 'final' z doliczonym finałem i 'closed_by'; reszta jak
--    dotąd 'abandoned'. Poprawka wsteczna dla już zamkniętych w ten sposób.
-- 2) Znaczniki czasu serwera przy żądaniu i potwierdzeniu planszy
--    (requested_at, rendered_at) — Control rozróżnia spóźniony Wyświetlacz
--    od potwierdzenia zgubionego w drodze. Kolumny dodające; stary kod ich
--    nie czyta.

ALTER TABLE public.game_state_display_completion
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS rendered_at timestamptz;

CREATE OR REPLACE FUNCTION public._control2_session_close(p_session_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Rozegrany finał (f_end): gra skończona, brakowało tylko „Zakończ”
  -- (FINISH_FINAL dolicza finał zwycięzcy). ended_at = ostatnia zmiana gry.
  UPDATE public.game_sessions
  SET status='final',
      ended_at=coalesce(last_seen_at, clock_timestamp()),
      team_a_score=team_a_score + CASE WHEN winner_team='A' THEN final_points ELSE 0 END,
      team_b_score=team_b_score + CASE WHEN winner_team='B' THEN final_points ELSE 0 END,
      stats_detail=coalesce(stats_detail,'{}'::jsonb) || jsonb_build_object('closed_by',p_reason)
  WHERE id=p_session_id AND ended_at IS NULL
    AND stats_detail->>'last_step'='f_end' AND final_points IS NOT NULL;
  IF FOUND THEN RETURN; END IF;

  UPDATE public.game_sessions
  SET status='abandoned', ended_at=clock_timestamp(), last_seen_at=clock_timestamp(),
      stats_detail=coalesce(stats_detail,'{}'::jsonb) || jsonb_build_object('end_reason',p_reason)
  WHERE id=p_session_id AND ended_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._control2_session_close(uuid, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION "public"."request_display_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF TG_OP = 'INSERT' OR NEW.step IS DISTINCT FROM OLD.step OR
    NEW.sound_cue_seq IS DISTINCT FROM OLD.sound_cue_seq THEN
  INSERT INTO public.game_state_display_completion(game_id, requested_rev, requested_at)
  VALUES(NEW.game_id, NEW.rev, clock_timestamp())
  ON CONFLICT(game_id) DO UPDATE
    SET requested_rev = excluded.requested_rev, requested_at = excluded.requested_at;
 END IF;
 RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION "public"."game_state_display_complete"("p_game_id" "uuid", "p_key" "text", "p_rev" bigint, "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id FOR UPDATE;
  IF current_rev IS NULL OR p_rev IS NULL OR p_rev<0 OR p_rev>current_rev THEN
    RAISE EXCEPTION 'invalid revision';
  END IF;

  INSERT INTO public.game_state_display_completion(game_id,rendered_rev,rendered_at)
    VALUES(p_game_id,p_rev,clock_timestamp())
    ON CONFLICT(game_id) DO UPDATE
      SET rendered_at=CASE WHEN excluded.rendered_rev>game_state_display_completion.rendered_rev
            THEN excluded.rendered_at ELSE game_state_display_completion.rendered_at END,
          rendered_rev=greatest(game_state_display_completion.rendered_rev,excluded.rendered_rev);

  -- This update emits the acknowledgment through the same RLS protected
  -- game_state stream already consumed by every device.
  UPDATE public.game_state
    SET display_rendered_rev=greatest(display_rendered_rev,p_rev)
    WHERE game_id=p_game_id AND display_rendered_rev<p_rev;
END $$;


CREATE OR REPLACE FUNCTION "public"."control_runtime_expire_one"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_session public.control_runtime_sessions;
BEGIN
  SELECT * INTO v_session FROM public.control_runtime_sessions
  WHERE id = p_session_id AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Zachowujemy przebieg wyłącznie jako statystykę; usuwamy jego aktywny
  -- wskaźnik i stan runtime, żeby kolejny Control wrócił do parowania.
  PERFORM public._control2_session_close(active.session_id, 'control_idle_expired')
  FROM public.game_session_active active
  WHERE active.game_id = v_session.game_id;
  DELETE FROM public.game_session_active WHERE game_id = v_session.game_id;

  UPDATE public.game_state
  SET rev = rev + 1,
      top_card = 'devices', step = 'devices_display', phase = NULL,
      control_team = NULL, sound_cue_key = NULL,
      sound_cue_seq = sound_cue_seq + 1, detail = '{}'::jsonb,
      updated_at = now()
  WHERE game_id = v_session.game_id;

  DELETE FROM public.device_connect_codes WHERE game_id = v_session.game_id;
  DELETE FROM public.device_presence WHERE game_id = v_session.game_id;
  UPDATE public.control_runtime_sessions
  SET ended_at = now(), end_reason = 'idle'
  WHERE id = p_session_id;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."control_game_cancel_for_settings"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_runtime public.control_runtime_sessions;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;

  SELECT gs.id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions gs ON gs.id=a.session_id AND gs.game_id=a.game_id
  WHERE a.game_id=p_game_id AND gs.ended_at IS NULL
  FOR UPDATE OF gs;
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'cancelled',false,'in_progress',false);
  END IF;

  SELECT * INTO v_runtime FROM public.control_runtime_sessions
  WHERE game_id=p_game_id AND ended_at IS NULL FOR UPDATE;
  IF FOUND AND v_runtime.expires_at<=clock_timestamp() THEN
    PERFORM public.control_runtime_expire_one(v_runtime.id);
    RETURN jsonb_build_object('ok',true,'cancelled',false,'in_progress',false);
  END IF;

  -- Close statistics and remove the active pointer before resetting game_state;
  -- the tracker trigger then cannot misclassify this as an ordinary restart.
  PERFORM public._control2_session_close(v_session_id,'settings_cancelled');
  DELETE FROM public.game_session_active WHERE game_id=p_game_id;

  UPDATE public.game_state
  SET rev=rev+1, top_card='devices', step='devices_display', phase=NULL,
      control_team=NULL, sound_cue_key=NULL, sound_cue_seq=sound_cue_seq+1,
      detail='{}'::jsonb, updated_at=clock_timestamp()
  WHERE game_id=p_game_id;

  DELETE FROM public.device_connect_codes WHERE game_id=p_game_id;
  DELETE FROM public.device_presence WHERE game_id=p_game_id;

  IF v_runtime.id IS NOT NULL THEN
    UPDATE public.control_runtime_sessions
    SET ended_at=clock_timestamp(), end_reason='settings_cancelled'
    WHERE id=v_runtime.id AND ended_at IS NULL;
  END IF;
  RETURN jsonb_build_object('ok',true,'cancelled',true,'in_progress',false);
END;
$$;
CREATE OR REPLACE FUNCTION "public"."track_control2_session"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
    JOIN public.game_sessions s ON s.id=x.session_id WHERE x.game_id=NEW.game_id FOR UPDATE OF s;
  sid := sess.id;

  -- Restart is observed in the same transaction as its new blank state.
  IF NOT started THEN
    IF sid IS NOT NULL AND sess.ended_at IS NULL THEN
      PERFORM public._control2_session_close(sid,'restart');
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
      WHEN NEW.step::text LIKE 'f_p1_map_q%' THEN 'p1_q' || coalesce(substring(NEW.step::text from 'q([1-5])$'), '1')
      WHEN NEW.step::text LIKE 'f_p2_map_q%' THEN 'p2_q' || coalesce(substring(NEW.step::text from 'q([1-5])$'), '1')
      WHEN NEW.step::text IN ('f_p2_start','f_p2_entry') THEN 'player2_entry'
      ELSE 'final_start' END;
  END IF;
  IF NEW.step::text IN ('r_gameEnd','f_end') THEN
    reason:=CASE WHEN played_final THEN CASE
      WHEN coalesce((d #>> '{final,runtime,reached200}')::boolean,false) THEN 'final_target' ELSE 'final_complete' END
      WHEN greatest(ra,rb)>=coalesce((d #>> '{settings,finalMinPoints}')::integer,300) THEN 'rounds_target'
      ELSE 'questions_exhausted' END;
    info:=info || jsonb_build_object('end_reason',reason,'end_screen',d #> '{settings,endScreenMode}');
    IF played_final AND d #>> '{settings,endScreenMode}'='money' THEN
      -- Regulamin TVP (Dział V pkt 21–22): punkty z rund × mnożnik, przy osiągniętym celu
      -- + kwota główna. Punkty finału decydują tylko o celu.
      info:=info || jsonb_build_object('prize', greatest(ra,rb) * coalesce((d #>> '{settings,finalPrizeMultiplier}')::integer,3)
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
$_$;
-- Poprawka wsteczna: sesje już zamknięte jako porzucone na f_end.
UPDATE public.game_sessions
SET status='final',
    team_a_score=team_a_score + CASE WHEN winner_team='A' THEN final_points ELSE 0 END,
    team_b_score=team_b_score + CASE WHEN winner_team='B' THEN final_points ELSE 0 END,
    stats_detail=stats_detail || jsonb_build_object(
      'closed_by', stats_detail->>'end_reason',
      'end_reason', CASE WHEN coalesce((stats_detail->>'target_reached')::boolean,false)
        THEN 'final_target' ELSE 'final_complete' END)
WHERE control_version=2 AND status='abandoned' AND ended_at IS NOT NULL
  AND stats_detail->>'last_step'='f_end' AND final_points IS NOT NULL
  AND stats_detail->>'end_reason' IN ('control_idle_expired','restart','settings_cancelled');
