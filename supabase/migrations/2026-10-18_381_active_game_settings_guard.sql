-- A running Control2 game owns a persistent logical lock until its game
-- session ends. Settings can inspect it and explicitly cancel it.

ALTER TABLE public.control_runtime_sessions
  DROP CONSTRAINT IF EXISTS control_runtime_sessions_end_reason_check;
ALTER TABLE public.control_runtime_sessions
  ADD CONSTRAINT control_runtime_sessions_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN ('idle', 'game_deleted', 'settings_cancelled'));

CREATE OR REPLACE FUNCTION public.control_game_settings_status(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_runtime public.control_runtime_sessions;
  v_game_session public.game_sessions;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;

  SELECT * INTO v_runtime FROM public.control_runtime_sessions
  WHERE game_id=p_game_id AND ended_at IS NULL FOR UPDATE;
  IF FOUND AND v_runtime.expires_at<=clock_timestamp() THEN
    PERFORM public.control_runtime_expire_one(v_runtime.id);
    v_runtime := NULL;
  END IF;

  SELECT gs.* INTO v_game_session
  FROM public.game_session_active a
  JOIN public.game_sessions gs ON gs.id=a.session_id AND gs.game_id=a.game_id
  WHERE a.game_id=p_game_id AND gs.ended_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'in_progress',false); END IF;

  RETURN jsonb_build_object('ok',true,'in_progress',true,
    'expires_at',v_runtime.expires_at,
    'started_at',v_game_session.started_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.control_game_cancel_for_settings(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
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
  UPDATE public.game_sessions
  SET status='abandoned', ended_at=clock_timestamp(), last_seen_at=clock_timestamp(),
      stats_detail=coalesce(stats_detail,'{}'::jsonb) || '{"end_reason":"settings_cancelled"}'::jsonb
  WHERE id=v_session_id AND ended_at IS NULL;
  DELETE FROM public.game_session_active WHERE game_id=p_game_id;

  UPDATE public.game_state
  SET rev=rev+1, top_card='devices', step='devices_display', phase=NULL,
      control_team=NULL, sound_cue_key=NULL, sound_cue_seq=sound_cue_seq+1,
      detail='{}'::jsonb, updated_at=clock_timestamp()
  WHERE game_id=p_game_id;

  DELETE FROM public.device_connect_codes WHERE game_id=p_game_id;
  DELETE FROM public.device_presence WHERE game_id=p_game_id;
  DELETE FROM public.display_audio_unlock WHERE game_id=p_game_id;
  DELETE FROM public.shared_devices WHERE game_id=p_game_id;

  IF v_runtime.id IS NOT NULL THEN
    UPDATE public.control_runtime_sessions
    SET ended_at=clock_timestamp(), end_reason='settings_cancelled'
    WHERE id=v_runtime.id AND ended_at IS NULL;
  END IF;
  RETURN jsonb_build_object('ok',true,'cancelled',true,'in_progress',false);
END;
$$;

REVOKE ALL ON FUNCTION public.control_game_settings_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_game_settings_status(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.control_game_cancel_for_settings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_game_cancel_for_settings(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
