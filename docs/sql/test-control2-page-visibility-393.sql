-- Rollback-only smoke test for migration 393: active visibility events for
-- Display, Host, Buzzer and Control appear in the Admin event log.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check(label text, condition boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', label; END IF;
  RAISE NOTICE 'ok: %', label;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('a3930000-0000-0000-0000-000000000001','visibility393@example.invalid',now());
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('b3930000-0000-0000-0000-000000000001','a3930000-0000-0000-0000-000000000001','Visibility393','prepared','draft');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,expires_at) VALUES
 ('c3930000-0000-0000-0000-000000000001','b3930000-0000-0000-0000-000000000001','a3930000-0000-0000-0000-000000000001',now()+interval '10 minutes');
SELECT set_config('request.jwt.claim.sub','a3930000-0000-0000-0000-000000000001',true);
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,detail)
VALUES ('b3930000-0000-0000-0000-000000000001',1,'rounds','r_play','PLAY',
  '{"locks":{"gameStarted":true,"gameEnded":false}}');

DO $$
DECLARE
  v_type text;
  v_token text;
  v_connection uuid;
  v_state jsonb;
  v_accepted boolean;
BEGIN
  FOREACH v_type IN ARRAY ARRAY['display','host','buzzer'] LOOP
    v_token := public.control_runtime_device_link(
      'b3930000-0000-0000-0000-000000000001',v_type
    )->>'token';
    v_connection := CASE v_type
      WHEN 'display' THEN 'd3930000-0000-0000-0000-000000000001'::uuid
      WHEN 'host' THEN 'd3930000-0000-0000-0000-000000000002'::uuid
      ELSE 'd3930000-0000-0000-0000-000000000003'::uuid END;
    v_state := public.control_device_instance_register(
      'b3930000-0000-0000-0000-000000000001',v_type,v_token,v_connection,
      '{"visibility":"visible","focused":true}'::jsonb
    );
    IF v_state->>'state'<>'primary' THEN
      RAISE EXCEPTION 'FAILED: % should become primary: %',v_type,v_state;
    END IF;
    v_accepted := public.control2_device_transport_event(
      'b3930000-0000-0000-0000-000000000001',v_type,v_token,
      jsonb_build_object('event_type','page_state','event_id',v_type||'-initial-393',
        'reason','initial','visibility','visible','focused',true,'online',true),
      v_connection,(v_state->>'epoch')::bigint
    );
    IF v_accepted IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAILED: initial visibility not accepted for %',v_type;
    END IF;
    v_accepted := public.control2_device_transport_event(
      'b3930000-0000-0000-0000-000000000001',v_type,v_token,
      jsonb_build_object('event_type','page_state','event_id',v_type||'-hidden-393',
        'reason','visibilitychange','visibility','hidden','focused',false,'online',true),
      v_connection,(v_state->>'epoch')::bigint
    );
    IF v_accepted IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAILED: visibility transition not accepted for %',v_type;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE v_accepted boolean;
BEGIN
  v_accepted := public.control2_control_visibility_event(
    'b3930000-0000-0000-0000-000000000001',
    '{"event_id":"control-hidden-393","reason":"visibilitychange","visibility":"hidden","focused":false,"online":true}'::jsonb
  );
  IF v_accepted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAILED: Control visibility transition was not accepted';
  END IF;
END $$;

SELECT pg_temp.check('initial and hidden snapshots recorded for three devices and Control',
  (SELECT count(*)=7 FROM public.control2_device_events
   WHERE game_id='b3930000-0000-0000-0000-000000000001' AND event_type='page_state'));
SELECT pg_temp.check('Admin event export identifies device and visibility transition',
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.get_control2_display_events(ARRAY(
        SELECT session_id FROM public.game_session_active
        WHERE game_id='b3930000-0000-0000-0000-000000000001'
      ))->(SELECT session_id::text FROM public.game_session_active
          WHERE game_id='b3930000-0000-0000-0000-000000000001')
    ) e
    WHERE e->>'category'='display_state'
      AND e->'devices' @> '["host"]'::jsonb
      AND e->'metrics'->>'visibility_reason'='visibilitychange'
      AND e->'metrics'->>'visibility'='hidden'
  ));
SELECT pg_temp.check('Control visibility is included in Admin event export',
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.get_control2_display_events(ARRAY(
        SELECT session_id FROM public.game_session_active
        WHERE game_id='b3930000-0000-0000-0000-000000000001'
      ))->(SELECT session_id::text FROM public.game_session_active
          WHERE game_id='b3930000-0000-0000-0000-000000000001')
    ) e
    WHERE e->>'category'='display_state'
      AND e->'devices' @> '["control"]'::jsonb
      AND e->'metrics'->>'visibility'='hidden'
  ));
ROLLBACK;
