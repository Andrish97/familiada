-- ============================================================
-- 125: email unsubscribe (niezarejestrowani)
-- ============================================================

-- 1. Tabela tokenów do globalnego unsubscribe (jeden wiersz per email)
--    suppressed_at IS NULL = tylko token zapisany (nie blokuje jeszcze)
--    suppressed_at IS NOT NULL = email zablokowany globalnie
-- ============================================================
CREATE TABLE public.email_unsub_tokens (
  email        text        PRIMARY KEY,
  token        uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  suppressed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_unsub_tokens ENABLE ROW LEVEL SECURITY;
-- brak polityk dla użytkowników — tylko funkcje SECURITY DEFINER

-- ============================================================
-- 2. Helper: pobierz lub utwórz token dla emaila
-- ============================================================
CREATE OR REPLACE FUNCTION public._ensure_unsub_token(p_email text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_token uuid;
BEGIN
  INSERT INTO public.email_unsub_tokens (email)
  VALUES (lower(trim(p_email)))
  ON CONFLICT (email) DO NOTHING;

  SELECT token INTO v_token
  FROM public.email_unsub_tokens
  WHERE email = lower(trim(p_email));

  RETURN v_token;
END;
$$;

-- ============================================================
-- 3. Zastąp polls_hub_subscription_invite_a — zwraca unsub_token
-- ============================================================
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite_a(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_h          text := trim(coalesce(p_handle,''));
  v_is_email   boolean := position('@' in v_h) > 1;
  v_profile    public.profiles%rowtype;
  v_existing   public.poll_subscriptions%rowtype;
  v_sub_id     uuid;
  v_token      uuid;
  v_to         text;
  v_go         text;
  v_until      timestamptz;
  v_block_ts   timestamptz;
  v_unsub_token uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty handle');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE lower(p.username) = lower(v_h)
     OR lower(p.email)    = lower(v_h)
  LIMIT 1;

  IF found THEN
    SELECT * INTO v_existing
    FROM public.poll_subscriptions s
    WHERE s.owner_id = v_uid AND s.subscriber_user_id = v_profile.id
    ORDER BY s.created_at DESC LIMIT 1;
  ELSE
    IF NOT v_is_email THEN
      RETURN jsonb_build_object('ok', false, 'error', 'unknown username (not registered)');
    END IF;
    SELECT * INTO v_existing
    FROM public.poll_subscriptions s
    WHERE s.owner_id = v_uid AND lower(s.subscriber_email) = lower(v_h)
    ORDER BY s.created_at DESC LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('pending','active') THEN
    v_token := v_existing.token;
    v_go    := ('poll-go?s=' || v_token::text)::text;
    v_to    := coalesce(v_profile.email, v_existing.subscriber_email);
    -- unsub token tylko dla email-only (niezarejestrowanych)
    IF v_profile.id IS NULL AND public._norm_email(v_to) IS NOT NULL THEN
      v_unsub_token := public._ensure_unsub_token(v_to);
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'sub_id', v_existing.id, 'status', v_existing.status,
      'token', v_token, 'go_url', v_go, 'to', v_to,
      'registered', (v_profile.id IS NOT NULL),
      'unsub_token', v_unsub_token
    );
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('cancelled','declined') THEN
    v_block_ts := coalesce(v_existing.cancelled_at, v_existing.declined_at, v_existing.created_at);
    v_until    := v_block_ts + interval '5 days';
    IF now() < v_until THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    END IF;
  END IF;

  v_token := gen_random_uuid();

  IF v_profile.id IS NOT NULL THEN
    INSERT INTO public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    VALUES (v_uid, v_profile.id, null, v_token, 'pending', now())
    RETURNING id INTO v_sub_id;
    v_to := v_profile.email;
  ELSE
    INSERT INTO public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    VALUES (v_uid, null, lower(v_h), v_token, 'pending', now())
    RETURNING id INTO v_sub_id;
    v_to := lower(v_h);
    -- generuj unsub token przy tworzeniu subskrypcji email-only
    v_unsub_token := public._ensure_unsub_token(v_to);
  END IF;

  v_go := ('poll-go?s=' || v_token::text)::text;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'sub_id', v_sub_id, 'status', 'pending',
    'token', v_token, 'go_url', v_go, 'to', v_to,
    'registered', (v_profile.id IS NOT NULL),
    'unsub_token', v_unsub_token
  );
END;
$$;

-- ============================================================
-- 4. Zastąp polls_hub_subscriber_resend — zwraca unsub_token
-- ============================================================
CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_resend(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_sub         public.poll_subscriptions%rowtype;
  v_to          text;
  v_link        text;
  v_until       timestamptz;
  v_unsub_token uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth required');
  END IF;

  SELECT * INTO v_sub
  FROM public.poll_subscriptions
  WHERE id = p_id AND owner_id = v_uid
  LIMIT 1;

  IF NOT found THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not found');
  END IF;

  IF v_sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only pending can be resent');
  END IF;

  IF v_sub.email_sent_at IS NOT NULL THEN
    v_until := v_sub.email_sent_at + interval '24 hours';
    IF now() < v_until THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    END IF;
  END IF;

  IF v_sub.subscriber_email IS NOT NULL THEN
    v_to := lower(v_sub.subscriber_email);
  ELSIF v_sub.subscriber_user_id IS NOT NULL THEN
    SELECT lower(p.email) INTO v_to
    FROM public.profiles p WHERE p.id = v_sub.subscriber_user_id LIMIT 1;
  END IF;

  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no email for this subscriber');
  END IF;

  v_link := ('poll-go?s=' || v_sub.token::text)::text;

  UPDATE public.poll_subscriptions
  SET email_sent_at = now(), email_send_count = email_send_count + 1
  WHERE id = p_id;

  -- unsub token tylko dla email-only
  IF v_sub.subscriber_email IS NOT NULL THEN
    v_unsub_token := public._ensure_unsub_token(v_to);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'to', v_to,
    'kind', 'sub_invite',
    'link', v_link,
    'token', v_sub.token,
    'registered', (v_sub.subscriber_user_id IS NOT NULL),
    'unsub_token', v_unsub_token
  );
END;
$$;

-- ============================================================
-- 5. poll_sub_unsubscribe — per-owner unsubscribe
--    Decline subskrypcji + anulowanie aktywnych tasków
-- ============================================================
CREATE OR REPLACE FUNCTION public.poll_sub_unsubscribe(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub        public.poll_subscriptions%rowtype;
  v_owner_label text;
BEGIN
  SELECT ps.*, p.username AS _label INTO v_sub
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token
  LIMIT 1;

  IF NOT found THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_sub.status NOT IN ('pending', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_inactive');
  END IF;

  SELECT p.username INTO v_owner_label
  FROM public.profiles p WHERE p.id = v_sub.owner_id LIMIT 1;

  -- Decline subskrypcji (ten sam efekt co decline → 5-dniowy cooldown)
  UPDATE public.poll_subscriptions
  SET status = 'declined', declined_at = now()
  WHERE id = v_sub.id;

  -- Anuluj wszystkie aktywne taski tego subskrybenta u tego właściciela
  UPDATE public.poll_tasks
  SET status = 'cancelled', cancelled_at = now()
  WHERE owner_id = v_sub.owner_id
    AND status IN ('pending', 'opened')
    AND (
      (v_sub.subscriber_user_id IS NOT NULL AND recipient_user_id = v_sub.subscriber_user_id)
      OR (v_sub.subscriber_email IS NOT NULL AND lower(recipient_email) = lower(v_sub.subscriber_email))
    );

  RETURN jsonb_build_object('ok', true, 'owner_label', coalesce(v_owner_label, ''));
END;
$$;

-- ============================================================
-- 6. Zastąp poll_go_resolve — obsługa unsub tokenów
-- ============================================================
CREATE OR REPLACE FUNCTION public.poll_go_resolve(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  t record;
  u record;
BEGIN
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    IF t.opened_at IS NULL AND t.status = 'pending' THEN
      UPDATE public.poll_tasks
      SET status = 'opened', opened_at = now()
      WHERE id = t.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'task',
      'task_id', t.id, 'status', t.status,
      'owner_id', t.owner_id, 'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id, 'game_name', t.game_name,
      'poll_type', t.poll_type, 'share_key_poll', t.share_key_poll
    );
  END IF;

  -- 3) global unsub token?
  SELECT email, suppressed_at INTO u
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF found THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'unsub',
      'already_suppressed', (u.suppressed_at IS NOT NULL)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
END;
$$;

-- ============================================================
-- 7. poll_go_global_unsubscribe — globalny unsubscribe
-- ============================================================
CREATE OR REPLACE FUNCTION public.poll_go_global_unsubscribe(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF NOT found THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Oznacz jako suppressed
  UPDATE public.email_unsub_tokens
  SET suppressed_at = now()
  WHERE token = p_token AND suppressed_at IS NULL;

  -- Anuluj wszystkie aktywne subskrypcje dla tego emaila
  UPDATE public.poll_subscriptions
  SET status = 'declined', declined_at = now()
  WHERE lower(subscriber_email) = lower(v_email)
    AND status IN ('pending', 'active');

  -- Anuluj wszystkie aktywne taski dla tego emaila
  UPDATE public.poll_tasks
  SET status = 'cancelled', cancelled_at = now()
  WHERE lower(recipient_email) = lower(v_email)
    AND status IN ('pending', 'opened');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 8. get_unsub_info_for_task_emails — do polls-hub.js
--    Zwraca sub_token + unsub_token per email dla danego właściciela
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unsub_info_for_task_emails(
  p_owner_id uuid,
  p_emails   text[]
)
RETURNS TABLE(email text, sub_token uuid, unsub_token uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lower(coalesce(ps.subscriber_email, '')) AS email,
    ps.token AS sub_token,
    ut.token AS unsub_token
  FROM public.poll_subscriptions ps
  LEFT JOIN public.email_unsub_tokens ut
    ON lower(ut.email) = lower(ps.subscriber_email)
  WHERE ps.owner_id = p_owner_id
    AND ps.status = 'active'
    AND ps.subscriber_email IS NOT NULL
    AND lower(ps.subscriber_email) = ANY(
      SELECT lower(e) FROM unnest(p_emails) AS e
    );
END;
$$;

-- ============================================================
-- 9. Trigger: przy rejestracji przenieś suppression → user_flags
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_profile_created_check_suppression()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_suppressed boolean;
BEGIN
  SELECT suppressed_at IS NOT NULL INTO v_suppressed
  FROM public.email_unsub_tokens
  WHERE lower(email) = lower(new.email)
  LIMIT 1;

  IF v_suppressed THEN
    INSERT INTO public.user_flags (user_id, email_notifications)
    VALUES (new.id, false)
    ON CONFLICT (user_id) DO UPDATE SET email_notifications = false;

    DELETE FROM public.email_unsub_tokens WHERE lower(email) = lower(new.email);
  END IF;

  RETURN new;
END;
$$;

CREATE TRIGGER trg_profile_created_suppression
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_created_check_suppression();
