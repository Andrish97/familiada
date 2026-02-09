-- Auth + account cooldowns (cross-device)
-- HEAD: c56a5de

-- =========================
-- 1) per-user cooldowns
-- =========================

CREATE TABLE IF NOT EXISTS public.user_cooldowns (
  user_id uuid NOT NULL,
  action_key text NOT NULL,
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_key)
);

ALTER TABLE public.user_cooldowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_cooldowns_select_own ON public.user_cooldowns;
CREATE POLICY user_cooldowns_select_own
ON public.user_cooldowns
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_cooldowns_insert_own ON public.user_cooldowns;
CREATE POLICY user_cooldowns_insert_own
ON public.user_cooldowns
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_cooldowns_update_own ON public.user_cooldowns;
CREATE POLICY user_cooldowns_update_own
ON public.user_cooldowns
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.cooldown_get(p_action_keys text[])
RETURNS TABLE(action_key text, next_allowed_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT uc.action_key, uc.next_allowed_at
  FROM public.user_cooldowns uc
  WHERE uc.user_id = auth.uid()
    AND uc.action_key = ANY(p_action_keys);
$$;

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
    ok := TRUE;
    next_allowed_at := new_next;
    RETURN;
  END IF;

  IF cur_next <= now() THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    UPDATE public.user_cooldowns
      SET next_allowed_at = new_next,
          updated_at = now()
      WHERE user_id = uid
        AND action_key = p_action_key;
    ok := TRUE;
    next_allowed_at := new_next;
    RETURN;
  END IF;

  ok := FALSE;
  next_allowed_at := cur_next;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cooldown_get(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cooldown_reserve(text,int) TO authenticated;

-- =========================
-- 2) per-email cooldowns (anon-safe)
-- =========================

CREATE TABLE IF NOT EXISTS public.email_cooldowns (
  email_hash text NOT NULL,
  action_key text NOT NULL,
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_hash, action_key)
);

ALTER TABLE public.email_cooldowns ENABLE ROW LEVEL SECURITY;

-- No direct policies; access only via SECURITY DEFINER RPC below.

CREATE OR REPLACE FUNCTION public.cooldown_email_get(
  p_email text,
  p_action_keys text[]
)
RETURNS TABLE(action_key text, next_allowed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h text;
BEGIN
  h := md5(lower(trim(p_email)));

  RETURN QUERY
  SELECT ec.action_key, ec.next_allowed_at
  FROM public.email_cooldowns ec
  WHERE ec.email_hash = h
    AND ec.action_key = ANY(p_action_keys);
END;
$$;

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
    ok := TRUE;
    next_allowed_at := new_next;
    RETURN;
  END IF;

  IF cur_next <= now() THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    UPDATE public.email_cooldowns
      SET next_allowed_at = new_next,
          updated_at = now()
      WHERE email_hash = h
        AND action_key = p_action_key;
    ok := TRUE;
    next_allowed_at := new_next;
    RETURN;
  END IF;

  ok := FALSE;
  next_allowed_at := cur_next;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cooldown_email_get(text,text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cooldown_email_reserve(text,text,int) TO anon, authenticated;
