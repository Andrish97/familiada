-- Zapisuje jawny rachunek nagrody oraz spójne błędy JS z każdej strony.

CREATE OR REPLACE FUNCTION public._control2_log_typed(
  p_game_session_id uuid, p_runtime_session_id uuid, p_game_id uuid, p_source text,
  p_connection_id uuid, p_event jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_type text := p_event->>'event_type';
  v_details jsonb;
  v_view jsonb;
  v_category text;
  v_message text;
BEGIN
  IF v_type IS NULL OR v_type NOT IN ('page_state','transport_state','state_sync','network_state',
      'render_stall','runtime_error','page_lifecycle','wake_lock','device_info','prize_render','log_delivery') THEN
    RETURN false;
  END IF;
  v_details := public._control2_sanitize_event(p_event) || jsonb_build_object('device_type', p_source);
  IF v_type = 'page_state' THEN
    v_details := (v_details - 'reason') || jsonb_build_object('visibility_reason', p_event->>'reason');
  END IF;
  v_view := public._control2_device_event_view(p_source, v_type, v_details);
  IF v_type = 'runtime_error' THEN
    v_category := 'runtime_error';
    v_message := CASE p_event->>'phase'
      WHEN 'uncaught_error' THEN 'Strona zgłosiła nieobsłużony błąd JavaScript.'
      WHEN 'unhandled_rejection' THEN 'Strona zgłosiła nieobsłużony błąd operacji asynchronicznej.'
      WHEN 'render' THEN 'Strona nie zdołała narysować odebranego stanu.'
      WHEN 'completion_ack' THEN 'Strona nie potwierdziła zakończenia renderowania.'
      ELSE 'Strona zgłosiła błąd działania.' END;
  ELSIF v_type = 'prize_render' THEN
    v_category := 'prize_calculation';
    v_message := 'Wyświetlacz obliczył i pokazał kwotę nagrody.';
  ELSIF v_type = 'log_delivery' THEN
    v_category := 'log_delivery';
    v_message := 'Dziennik diagnostyczny wznowił zapis po przerwie.';
  ELSE
    v_category := v_view->>'category';
    v_message := v_view->>'message';
  END IF;
  RETURN public._control2_session_event_add(p_game_session_id, p_runtime_session_id, p_game_id, p_source,
    p_connection_id, 'diagnostic', v_category, v_type, v_message,
    jsonb_build_array(p_source), v_view->'metrics', p_event->>'event_id', now());
END;
$$;

REVOKE ALL ON FUNCTION public._control2_log_typed(uuid, uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._control2_record_prize_calculation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_settings jsonb := coalesce(NEW.stats_detail->'settings', '{}'::jsonb);
  v_round_points integer;
  v_final_points integer := coalesce(NEW.final_points, 0);
  v_multiplier integer := coalesce((v_settings->>'finalPrizeMultiplier')::integer, 3);
  v_main_prize integer := coalesce((v_settings->>'mainPrizeAmount')::integer, 25000);
  v_hit_target boolean := coalesce((NEW.stats_detail->>'target_reached')::boolean, false);
  v_base integer;
  v_prize integer;
BEGIN
  IF NEW.stats_detail ? 'prize' AND NEW.winner_team IN ('A', 'B') THEN
    v_round_points := CASE NEW.winner_team WHEN 'A' THEN coalesce(NEW.rounds_score_a, 0) ELSE coalesce(NEW.rounds_score_b, 0) END;
    v_base := v_round_points * v_multiplier;
    v_prize := v_base + CASE WHEN v_hit_target THEN v_main_prize ELSE 0 END;
    NEW.stats_detail := NEW.stats_detail || jsonb_build_object(
      'prize_calculation', jsonb_build_object(
        'rule_version', 1,
        'formula', 'winning_round_points * final_prize_multiplier + main_prize_if_target_reached',
        'winner_team', NEW.winner_team,
        'winning_round_points', v_round_points,
        'final_points_excluded_from_multiplier', v_final_points,
        'final_prize_multiplier', v_multiplier,
        'base_prize', v_base,
        'target_reached', v_hit_target,
        'main_prize_amount', v_main_prize,
        'main_prize_awarded', CASE WHEN v_hit_target THEN v_main_prize ELSE 0 END,
        'calculated_prize', v_prize,
        'stored_prize_before_trigger', (NEW.stats_detail->>'prize')::numeric,
        'matches_stored_prize', (NEW.stats_detail->>'prize')::numeric = v_prize
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS control2_record_prize_calculation ON public.game_sessions;
CREATE TRIGGER control2_record_prize_calculation
BEFORE UPDATE OF stats_detail, winner_team, rounds_score_a, rounds_score_b, final_points
ON public.game_sessions
FOR EACH ROW EXECUTE FUNCTION public._control2_record_prize_calculation();

NOTIFY pgrst, 'reload schema';
