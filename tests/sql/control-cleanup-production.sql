DO $$
BEGIN
  IF to_regclass('public.game_sessions') IS NULL THEN
    RAISE EXCEPTION 'game_sessions history table was removed';
  END IF;
  IF to_regclass('public.game_state') IS NULL THEN
    RAISE EXCEPTION 'current game_state table was removed';
  END IF;
  IF to_regclass('public.device_presence') IS NULL THEN
    RAISE EXCEPTION 'live device presence table was removed';
  END IF;
  IF to_regclass('public.device_state') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy device_state table remains';
  END IF;
  IF to_regtype('public.device_kind') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy device_kind type remains';
  END IF;
  IF to_regprocedure('public.device_state_get(uuid,public.device_type,text)') IS NOT NULL
     OR to_regprocedure('public.device_state_set_public(uuid,public.device_type,text,jsonb)') IS NOT NULL
     OR to_regprocedure('public.ensure_device_state(uuid)') IS NOT NULL
     OR to_regprocedure('public.game_session_start(uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('public.game_session_update(uuid,text,integer,jsonb)') IS NOT NULL
     OR to_regprocedure('public.game_session_end(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.game_session_end(uuid,text,text,text,integer,integer)') IS NOT NULL
     OR to_regprocedure('public.game_session_end(uuid,text,text,text,integer,integer,integer,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy Control RPC remains';
  END IF;
END $$;
