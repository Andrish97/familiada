-- cancel_my_email_change():
--   Clears new_email + tokens from auth.users AND marks email_intents as expired.
--   Called by authenticated user to cancel their own pending email change.

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

  -- Read pending new_email before clearing it
  SELECT new_email INTO v_new_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Clear new_email + email change tokens from auth.users
  PERFORM public.auth_clear_email_change(v_user_id);

  -- Mark email_intents as expired so auth-email-status sees no pending
  IF v_new_email IS NOT NULL AND v_new_email <> '' THEN
    UPDATE public.email_intents
    SET status = 'expired', updated_at = now()
    WHERE email = lower(v_new_email);
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_my_email_change() TO authenticated;


-- initiate_email_change_intent(p_new_email):
--   Writes pending state to email_intents when user initiates email change.
--   Allows auth-email-status to detect the pending state without hitting auth.users directly.

CREATE OR REPLACE FUNCTION public.initiate_email_change_intent(p_new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.email_intents (email, intent, status, cooldown_until, user_id)
  VALUES (
    lower(p_new_email),
    'guest_migrate',
    'pending',
    now() + interval '24 hours',
    auth.uid()
  )
  ON CONFLICT (email) DO UPDATE SET
    intent        = 'guest_migrate',
    status        = 'pending',
    cooldown_until = now() + interval '24 hours',
    user_id       = auth.uid(),
    updated_at    = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_email_change_intent(text) TO authenticated;


-- get_email_intent_status(p_email):
--   Returns the email_intents.status for a given email, or NULL if no record.
--   Used by confirm.js to detect if an email change link is stale (cancelled).
--   Accessible to anon + authenticated (reads only status, no PII beyond what caller provides).

CREATE OR REPLACE FUNCTION public.get_email_intent_status(p_email text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT status FROM public.email_intents WHERE email = lower(p_email) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_intent_status(text) TO anon, authenticated;
