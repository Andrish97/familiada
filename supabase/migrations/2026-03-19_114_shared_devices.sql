-- 114: Shared devices (host/buzzer) – udostępnianie urządzeń mobilnych między użytkownikami

-- Tabela: shared_devices
-- Właściciel udostępnia swoje urządzenie (host lub buzzer) innemu użytkownikowi.
-- Mechanizm analogiczny do question_base_shares.

CREATE TABLE IF NOT EXISTS public.shared_devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('host', 'buzzer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, recipient_id, device_type)
);

ALTER TABLE public.shared_devices ENABLE ROW LEVEL SECURITY;

-- Właściciel widzi swoje udostępnienia
CREATE POLICY "owner can manage" ON public.shared_devices
  FOR ALL USING (owner_id = auth.uid());

-- Odbiorca widzi swoje
CREATE POLICY "recipient can view" ON public.shared_devices
  FOR SELECT USING (recipient_id = auth.uid());

-- RPC: udostępnij urządzenie (przez user_id)
CREATE OR REPLACE FUNCTION public.share_device(
  p_recipient_user_id uuid,
  p_device_type text
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
  IF p_device_type NOT IN ('host', 'buzzer') THEN RETURN jsonb_build_object('ok', false, 'err', 'invalid_type'); END IF;

  INSERT INTO public.shared_devices (owner_id, recipient_id, device_type)
  VALUES (v_owner, p_recipient_user_id, p_device_type)
  ON CONFLICT (owner_id, recipient_id, device_type) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- RPC: cofnij udostępnienie
CREATE OR REPLACE FUNCTION public.unshare_device(
  p_recipient_user_id uuid,
  p_device_type text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.shared_devices
  WHERE owner_id = auth.uid()
    AND recipient_id = p_recipient_user_id
    AND device_type = p_device_type;
  RETURN true;
END;
$$;

-- RPC: lista urządzeń udostępnionych MI (jako odbiorcy)
-- Zwraca: device_type, owner_username, owner_email, share_id
CREATE OR REPLACE FUNCTION public.list_shared_devices_for_me()
RETURNS TABLE (
  share_id    uuid,
  device_type text,
  owner_id    uuid,
  owner_username text,
  owner_email text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.id,
    sd.device_type,
    sd.owner_id,
    p.username,
    p.email
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.owner_id
  WHERE sd.recipient_id = auth.uid();
END;
$$;

-- RPC: lista moich subskrybentów którym udostępniłem urządzenia
-- (do modala share – analogicznie do bases)
CREATE OR REPLACE FUNCTION public.list_my_device_shares()
RETURNS TABLE (
  share_id      uuid,
  device_type   text,
  recipient_id  uuid,
  recipient_username text,
  recipient_email text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.id,
    sd.device_type,
    sd.recipient_id,
    p.username,
    p.email
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.recipient_id
  WHERE sd.owner_id = auth.uid();
END;
$$;
