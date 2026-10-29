-- 097: dodaj funkcję update_base_share_role do zmiany roli udostępnienia
-- Używana przez UI w modalu udostępnienia — użytkownik może zmienić rolę (editor/viewer)
-- bez cofania udostępnienia i dodawania od nowa.

-- Funkcja: update_base_share_role(p_base_id, p_user_id, p_role)
-- Zwraca ok=true po sukcesie, ok=false + err po błędzie

CREATE OR REPLACE FUNCTION public.update_base_share_role(
  p_base_id uuid,
  p_user_id uuid,
  p_role public.base_share_role
)
RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
  v_exists boolean;
BEGIN
  -- Sprawdź czy baza istnieje
  SELECT owner_id INTO v_owner_id
  FROM public.question_bases
  WHERE id = p_base_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'base_not_found';
    RETURN;
  END IF;

  -- Tylko owner może zmienić rolę
  IF v_owner_id <> auth.uid() THEN
    RETURN QUERY SELECT false, 'not_owner';
    RETURN;
  END IF;

  -- Sprawdź czy share istnieje
  SELECT EXISTS (
    SELECT 1 FROM public.base_shares
    WHERE base_id = p_base_id AND user_id = p_user_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN QUERY SELECT false, 'share_not_found';
    RETURN;
  END IF;

  -- Aktualizuj rolę
  UPDATE public.base_shares
  SET role = p_role,
      updated_at = now()
  WHERE base_id = p_base_id AND user_id = p_user_id;

  RETURN QUERY SELECT true, ''::text;
END;
$$;

-- Grant wykonania dla authenticated
GRANT EXECUTE ON FUNCTION public.update_base_share_role(uuid, uuid, public.base_share_role) TO authenticated;
