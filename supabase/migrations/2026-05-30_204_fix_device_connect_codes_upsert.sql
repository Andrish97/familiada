-- 204: Fix generate_device_connect_code — replace SELECT+INSERT with atomic UPSERT
-- Poprzednia wersja miała race condition: SELECT znajdował brak wiersza,
-- ale INSERT kończył się błędem unique constraint gdy kod już istniał.

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
BEGIN
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated');
  END IF;

  -- Usuń wygasłe kody (tylko te z ustawionym expires_at)
  DELETE FROM public.device_connect_codes
  WHERE owner_id = v_owner
    AND game_id = p_game_id
    AND device_type = p_device_type
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Wygeneruj nowy kod (użyty tylko jeśli brak istniejącego)
  v_code := gen_connect_code();

  -- Atomowy upsert: wstaw nowy kod lub zaktualizuj share_key przy konflikcie.
  -- RETURNING zwraca istniejący code jeśli był konflikt (code nie jest aktualizowany).
  INSERT INTO public.device_connect_codes
    (code, owner_id, game_id, game_name, device_type, share_key, expires_at)
  VALUES
    (v_code, v_owner, p_game_id, p_game_name, p_device_type, p_share_key, p_expires_at)
  ON CONFLICT (owner_id, game_id, device_type) DO UPDATE
    SET share_key = EXCLUDED.share_key,
        game_name = COALESCE(EXCLUDED.game_name, device_connect_codes.game_name)
  RETURNING code INTO v_code;

  RETURN jsonb_build_object('ok', true, 'code', v_code);
END;
$$;

NOTIFY pgrst, 'reload schema';
