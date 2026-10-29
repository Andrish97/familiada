-- Preserve local events when telemetry and gameplay write concurrently.
-- Lock the session before reading its JSON, just as the ping RPC does.
CREATE OR REPLACE FUNCTION public.track_control2_session() RETURNS trigger
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
    JOIN public.game_sessions s ON s.id=x.session_id WHERE x.game_id=NEW.game_id FOR UPDATE OF s;
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
