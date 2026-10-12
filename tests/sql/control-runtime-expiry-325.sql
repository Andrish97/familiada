-- Produkcyjny smoke TTL Control: tworzy wyłącznie transakcyjne fixture'y,
-- skraca ich TTL i sprawdza ten sam cleanup co minutowy cron. ROLLBACK
-- pozostawia produkcyjne dane i testowe konta nietknięte.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_recipient uuid := gen_random_uuid();
  v_game uuid := gen_random_uuid();
  v_game_session uuid;
  v_runtime uuid;
  v_new_runtime uuid;
  v_pair jsonb;
  v_share jsonb;
  v_touch jsonb;
  v_resolved jsonb;
  v_cron_jobs integer;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'pg_cron job registry is unavailable';
  END IF;
  EXECUTE $q$
    SELECT count(*) FROM cron.job
    WHERE jobname='control-runtime-expiry' AND schedule='* * * * *'
      AND command LIKE '%control_runtime_expire_due%'
  $q$ INTO v_cron_jobs;
  IF v_cron_jobs <> 1 THEN RAISE EXCEPTION 'Control expiry cron is not scheduled each minute'; END IF;

  INSERT INTO auth.users(id,email) VALUES
    (v_owner,'control-expiry-owner-'||v_owner||'@example.invalid'),
    (v_recipient,'control-expiry-recipient-'||v_recipient||'@example.invalid');
  INSERT INTO public.games(id,owner_id,name)
  VALUES(v_game,v_owner,'Control expiry smoke');
  INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
  VALUES(v_game,7,'rounds','r_play','PLAY','A','{"locks":{"gameStarted":true}}');
  SELECT session_id INTO v_game_session FROM public.game_session_active WHERE game_id=v_game;
  IF v_game_session IS NULL THEN RAISE EXCEPTION 'gameplay telemetry fixture did not start'; END IF;
  INSERT INTO public.device_connect_codes(code,owner_id,game_id,game_name,device_type,share_key)
  VALUES('expiry-'||substr(replace(v_game::text,'-',''),1,20),v_owner,v_game,
    'Control expiry smoke','display','legacy-smoke-key');
  INSERT INTO public.device_presence(game_id,device_type,device_id)
  VALUES(v_game,'display','expiry-smoke-display');
  INSERT INTO public.display_audio_unlock(game_id,session_nonce,request_nonce)
  VALUES(v_game,'expiry-smoke-session','expiry-smoke-request');
  INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce,description)
  VALUES('device:share','pair',3600,true,'temporary Control expiry smoke')
  ON CONFLICT(action_key) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  v_touch := public.control_runtime_session_touch(v_game,NULL);
  IF v_touch->>'ok' <> 'true' THEN RAISE EXCEPTION 'could not start Control runtime: %',v_touch; END IF;
  v_runtime := (v_touch->>'session_id')::uuid;
  v_pair := public.control_runtime_device_link(v_game,'display');
  v_share := public.control_device_share_create(v_game,'host',v_recipient,NULL);
  IF v_pair->>'ok' <> 'true' OR v_share->>'created' <> 'true' THEN
    RAISE EXCEPTION 'could not create session device tokens: pair %, share %',v_pair,v_share;
  END IF;
  IF NOT public.control_device_key_valid(v_game,'display',v_pair->>'token')
     OR NOT public.control_device_key_valid(v_game,'host',v_share->>'token') THEN
    RAISE EXCEPTION 'new session tokens do not authorize their device';
  END IF;

  UPDATE public.control_runtime_sessions SET expires_at=now()-interval '1 second'
  WHERE id=v_runtime;
  v_touch := public.control_runtime_session_touch(v_game,v_runtime);
  v_new_runtime := (v_touch->>'session_id')::uuid;
  IF v_touch->>'expired' <> 'true' OR v_new_runtime=v_runtime THEN
    RAISE EXCEPTION 'expired Control session did not restart from a new runtime: %',v_touch;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_state WHERE game_id=v_game
      AND top_card='devices' AND step='devices_display' AND phase IS NULL AND detail='{}'::jsonb) THEN
    RAISE EXCEPTION 'Control game state did not reset to device pairing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_sessions WHERE id=v_game_session
      AND status='abandoned' AND ended_at IS NOT NULL)
     OR EXISTS(SELECT 1 FROM public.game_session_active WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'active gameplay telemetry was not closed';
  END IF;
  IF public.control_device_key_valid(v_game,'display',v_pair->>'token')
     OR public.control_device_key_valid(v_game,'host',v_share->>'token') THEN
    RAISE EXCEPTION 'expired runtime retained an active device token';
  END IF;
  v_resolved := public.control_device_share_resolve((v_share->>'token')::uuid);
  IF v_resolved->>'state' <> 'expired' THEN
    RAISE EXCEPTION 'expired share token does not resolve to expired: %',v_resolved;
  END IF;
  IF EXISTS(SELECT 1 FROM public.device_connect_codes WHERE game_id=v_game)
     OR EXISTS(SELECT 1 FROM public.device_presence WHERE game_id=v_game)
     OR EXISTS(SELECT 1 FROM public.display_audio_unlock WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'Control expiry left temporary pairing/presence/audio records';
  END IF;
END $$;
ROLLBACK;
