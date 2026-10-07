-- Isolated disposable schema fixture. Never run against the application database.
\set ON_ERROR_STOP on
CREATE TYPE public.device_type AS ENUM ('display','host','buzzer');
CREATE TYPE public.device_kind AS ENUM ('display','host','buzzer','control');
CREATE TABLE public.game_sessions(id integer PRIMARY KEY, result text);
INSERT INTO public.game_sessions VALUES (1,'historical result');
CREATE TABLE public.game_state(id integer PRIMARY KEY);
CREATE TABLE public.device_presence(id integer PRIMARY KEY);
CREATE TABLE public.device_state(id integer PRIMARY KEY);
CREATE FUNCTION public.game_session_start(uuid,jsonb DEFAULT '{}'::jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.game_session_update(uuid,text,integer,jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.game_session_end(uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.game_session_end(uuid,text,text,text,integer,integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.game_session_end(uuid,text,text,text,integer,integer,integer,integer,integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.device_state_get(uuid,public.device_type,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.device_state_set_public(uuid,public.device_type,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.device_state_set_admin(uuid,public.device_kind,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.ensure_device_state(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
\ir ../../supabase/migrations/2026-10-07_306_remove_legacy_control.sql
DO $$
BEGIN
  IF (SELECT count(*) FROM public.game_sessions) <> 1 OR
     (SELECT result FROM public.game_sessions WHERE id=1) <> 'historical result' THEN
    RAISE EXCEPTION 'historical game_sessions data was changed';
  END IF;
  IF to_regclass('public.game_state') IS NULL OR to_regclass('public.device_presence') IS NULL THEN
    RAISE EXCEPTION 'current gameplay tables were removed';
  END IF;
  IF to_regclass('public.device_state') IS NOT NULL OR to_regtype('public.device_kind') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy snapshot objects remain';
  END IF;
  IF to_regprocedure('public.game_session_start(uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('public.game_session_update(uuid,text,integer,jsonb)') IS NOT NULL
     OR to_regprocedure('public.game_session_end(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.game_session_end(uuid,text,text,text,integer,integer)') IS NOT NULL
     OR to_regprocedure('public.game_session_end(uuid,text,text,text,integer,integer,integer,integer,integer)') IS NOT NULL
     OR to_regprocedure('public.device_state_get(uuid,public.device_type,text)') IS NOT NULL
     OR to_regprocedure('public.device_state_set_public(uuid,public.device_type,text,jsonb)') IS NOT NULL
     OR to_regprocedure('public.ensure_device_state(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy Control RPC remains';
  END IF;
END $$;
