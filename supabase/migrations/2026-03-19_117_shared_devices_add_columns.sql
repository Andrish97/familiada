-- 117: Dodaj brakujące kolumny do shared_devices (115 była oznaczona applied mimo błędu)
ALTER TABLE public.shared_devices
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game_name text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Przebuduj funkcje które używają tych kolumn
DROP FUNCTION IF EXISTS public.list_shared_devices_for_me();
DROP FUNCTION IF EXISTS public.list_my_device_shares();
DROP FUNCTION IF EXISTS public.share_device(uuid, text);
DROP FUNCTION IF EXISTS public.share_device(uuid, text, uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.share_device(
  p_recipient_user_id uuid,
  p_device_type text,
  p_game_id uuid DEFAULT NULL,
  p_game_name text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated'); END IF;
  IF v_owner = p_recipient_user_id THEN RETURN jsonb_build_object('ok', false, 'err', 'self_share'); END IF;
  IF p_device_type NOT IN ('host', 'buzzer', 'display') THEN RETURN jsonb_build_object('ok', false, 'err', 'invalid_type'); END IF;

  INSERT INTO public.shared_devices (owner_id, recipient_id, device_type, game_id, game_name, expires_at)
  VALUES (v_owner, p_recipient_user_id, p_device_type, p_game_id, p_game_name, p_expires_at)
  ON CONFLICT (owner_id, recipient_id, device_type)
  DO UPDATE SET game_id = EXCLUDED.game_id, game_name = EXCLUDED.game_name, expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_shared_devices_for_me()
RETURNS TABLE (
  share_id uuid, device_type text, owner_id uuid,
  owner_username text, owner_email text,
  game_id uuid, game_name text, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.shared_devices WHERE expires_at IS NOT NULL AND expires_at < now();
  RETURN QUERY
  SELECT sd.id, sd.device_type, sd.owner_id, p.username, p.email, sd.game_id, sd.game_name, sd.expires_at
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.owner_id
  WHERE sd.recipient_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_device_shares()
RETURNS TABLE (
  share_id uuid, device_type text, recipient_id uuid,
  recipient_username text, recipient_email text,
  game_id uuid, game_name text, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT sd.id, sd.device_type, sd.recipient_id, p.username, p.email, sd.game_id, sd.game_name, sd.expires_at
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.recipient_id
  WHERE sd.owner_id = auth.uid();
END;
$$;
