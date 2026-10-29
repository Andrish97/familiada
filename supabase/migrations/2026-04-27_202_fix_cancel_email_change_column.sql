-- 202: Poprawka funkcji cancel_my_email_change (zmiana kolumny na email_change)

CREATE OR REPLACE FUNCTION public.cancel_my_email_change()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_new_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- W nowszych wersjach Supabase kolumna nazywa się 'email_change', a nie 'new_email'
  SELECT email_change INTO v_new_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Czyścimy tokeny i oczekujący e-mail
  PERFORM public.auth_clear_email_change(v_user_id);

  -- Oznaczamy intencję jako wygasłą w naszej tabeli pomocniczej
  IF v_new_email IS NOT NULL AND v_new_email <> '' THEN
    UPDATE public.email_intents
    SET status = 'expired', updated_at = now()
    WHERE email = lower(v_new_email);
  END IF;

  RETURN true;
END;
$$;
