-- 203: Device connect codes (6-cyfrowe kody BLIK-style do łączenia urządzeń)
-- Kod to skrót do pełnego linka (share_key). Jeden kod na sesję / typ urządzenia.

CREATE TABLE IF NOT EXISTS public.device_connect_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id     uuid REFERENCES public.games(id) ON DELETE CASCADE,
  game_name   text,
  device_type text NOT NULL CHECK (device_type IN ('display', 'host', 'buzzer')),
  share_key   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  UNIQUE (owner_id, game_id, device_type),
  UNIQUE (code)
);

ALTER TABLE public.device_connect_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage device_connect_codes" ON public.device_connect_codes
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "anyone can read device_connect_codes" ON public.device_connect_codes
  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.gen_connect_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code   text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    SELECT EXISTS (
      SELECT 1 FROM public.device_connect_codes
      WHERE code = v_code
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_device_connect_code(
  p_game_id     uuid,
  p_device_type text,
  p_share_key   text,
  p_game_name   text DEFAULT NULL,
  p_expires_at  timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_owner    uuid := auth.uid();
  v_code     text;
  v_existing record;
BEGIN
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated');
  END IF;

  DELETE FROM public.device_connect_codes
  WHERE owner_id = v_owner
    AND game_id = p_game_id
    AND device_type = p_device_type
    AND expires_at IS NOT NULL
    AND expires_at < now();

  SELECT * INTO v_existing
  FROM public.device_connect_codes
  WHERE owner_id = v_owner
    AND game_id = p_game_id
    AND device_type = p_device_type;

  IF v_existing IS NOT NULL THEN
    UPDATE public.device_connect_codes
    SET share_key = p_share_key,
        game_name = COALESCE(p_game_name, game_name)
    WHERE id = v_existing.id;
    RETURN jsonb_build_object('ok', true, 'code', v_existing.code);
  END IF;

  v_code := gen_connect_code();

  INSERT INTO public.device_connect_codes
    (code, owner_id, game_id, game_name, device_type, share_key, expires_at)
  VALUES
    (v_code, v_owner, p_game_id, p_game_name, p_device_type, p_share_key, p_expires_at);

  RETURN jsonb_build_object('ok', true, 'code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_device_connect_code(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rec record;
BEGIN
  DELETE FROM public.device_connect_codes
  WHERE expires_at IS NOT NULL AND expires_at < now();

  SELECT dcc.*, p.username AS owner_username
  INTO v_rec
  FROM public.device_connect_codes dcc
  JOIN public.profiles p ON p.id = dcc.owner_id
  WHERE dcc.code = p_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'code',           v_rec.code,
    'device_type',    v_rec.device_type,
    'game_id',        v_rec.game_id,
    'game_name',      v_rec.game_name,
    'share_key',      v_rec.share_key,
    'owner_username', v_rec.owner_username
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
