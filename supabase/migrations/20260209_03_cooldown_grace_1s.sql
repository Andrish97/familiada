-- Cooldown reserve grace: treat <= 1s as expired (avoid '0:00' blocks)
-- HEAD: 38a722d

-- 1) per-user cooldown reserve (authenticated)
CREATE OR REPLACE FUNCTION public.cooldown_reserve(
  p_action_key text,
  p_cooldown_seconds int
)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  uid uuid;
  cur_next timestamptz;
  new_next timestamptz;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT uc.next_allowed_at
    INTO cur_next
  FROM public.user_cooldowns uc
  WHERE uc.user_id = uid
    AND uc.action_key = p_action_key
  FOR UPDATE;

  IF NOT FOUND THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    INSERT INTO public.user_cooldowns(user_id, action_key, next_allowed_at, updated_at)
    VALUES (uid, p_action_key, new_next, now());
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  -- grace window: if it's within 1 second, consider it expired
  IF cur_next <= (now() + make_interval(secs => 1)) THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    UPDATE public.user_cooldowns
      SET next_allowed_at = new_next,
          updated_at = now()
      WHERE user_id = uid
        AND action_key = p_action_key;
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, cur_next;
  RETURN;
END;
$$;

-- 2) per-email cooldown reserve (anon-safe via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.cooldown_email_reserve(
  p_email text,
  p_action_key text,
  p_cooldown_seconds int
)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h text;
  cur_next timestamptz;
  new_next timestamptz;
BEGIN
  h := md5(lower(trim(p_email)));

  SELECT ec.next_allowed_at
    INTO cur_next
  FROM public.email_cooldowns ec
  WHERE ec.email_hash = h
    AND ec.action_key = p_action_key
  FOR UPDATE;

  IF NOT FOUND THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    INSERT INTO public.email_cooldowns(email_hash, action_key, next_allowed_at, updated_at)
    VALUES (h, p_action_key, new_next, now());
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  -- grace window: if it's within 1 second, consider it expired
  IF cur_next <= (now() + make_interval(secs => 1)) THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    UPDATE public.email_cooldowns
      SET next_allowed_at = new_next,
          updated_at = now()
      WHERE email_hash = h
        AND action_key = p_action_key;
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, cur_next;
  RETURN;
END;
$$;
