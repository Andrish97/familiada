-- Ujednolicenie cooldownów maili (warstwa 1, część 5/7).
--
-- Trzy niezależne implementacje tego samego pojęcia w ankietach, każda
-- inaczej licząca własny cooldown inline, zamieniane na wspólny
-- mail_cooldown_check/reserve (migracja 288) z zachowaniem dzisiejszej
-- granularności: polls_hub_subscription_invite/polls_hub_subscriber_resend
-- per (owner,recipient) -- subskrypcja nie jest przypisana do konkretnej
-- gry; polls_hub_share_poll per (owner,recipient,game) -- udostępnienie
-- KONKRETNEJ ankiety. Zmiana klucza JSON "error"->"err" dla zgodności z
-- resztą RPC-ów (base_share_*/share_device) -- wymaga dopasowania w
-- js/pages/subscriptions.js i js/pages/polls-hub.js (osobno, poza
-- migracjami). Dead code: polls_sub_cooldown_active (zero wywołań w
-- całym repo, zdublowana, lekko inna logika tego samego liczenia) --
-- usuwane, nie zostawiane jako trzecia zdryfowana kopia.

DROP FUNCTION IF EXISTS public.polls_sub_cooldown_active(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_resend(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_sub         public.poll_subscriptions%rowtype;
  v_to          text;
  v_link        text;
  v_target      text;
  v_cd_ok       boolean;
  v_cd_until    timestamptz;
  v_unsub_token uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT * INTO v_sub
  FROM public.poll_subscriptions
  WHERE id = p_id AND owner_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not found');
  END IF;

  IF v_sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'only pending can be resent');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(v_sub.subscriber_user_id::text, 'email:' || md5(lower(coalesce(v_sub.subscriber_email, ''))));
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('poll:resend', v_target);
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  IF v_sub.subscriber_email IS NOT NULL THEN
    v_to := lower(v_sub.subscriber_email);
  ELSIF v_sub.subscriber_user_id IS NOT NULL THEN
    SELECT lower(p.email) INTO v_to FROM public.profiles p WHERE p.id = v_sub.subscriber_user_id LIMIT 1;
  END IF;

  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this subscriber');
  END IF;

  v_link := ('poll-go?s=' || v_sub.token::text)::text;

  UPDATE public.poll_subscriptions
  SET email_sent_at = now(), email_send_count = email_send_count + 1
  WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('poll:resend', v_target);

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

CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite(p_recipient text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_rec      text := lower(trim(coalesce(p_recipient, '')));
  v_user_id  uuid;
  v_email    text;
  v_id       uuid;
  v_token    uuid;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
BEGIN
  IF v_rec = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty recipient');
  END IF;

  SELECT id, email INTO v_user_id, v_email FROM public.profiles WHERE lower(username) = v_rec LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT id, email INTO v_user_id, v_email FROM public.profiles WHERE lower(email) = v_rec LIMIT 1;
  END IF;
  IF v_email IS NULL THEN
    v_email := v_rec;
  END IF;

  SELECT ps.id, ps.token INTO v_id, v_token
  FROM public.poll_subscriptions ps
  WHERE ps.owner_id = auth.uid()
    AND ((v_user_id IS NOT NULL AND ps.subscriber_user_id = v_user_id)
      OR (ps.subscriber_email IS NOT NULL AND lower(ps.subscriber_email) = v_email))
    AND ps.status IN ('pending', 'active')
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'id', v_id, 'token', v_token,
      'channel', CASE WHEN v_user_id IS NOT NULL THEN 'onsite' ELSE 'email' END
    );
  END IF;

  v_target := 'pair:' || auth.uid()::text || ':' || coalesce(v_user_id::text, 'email:' || md5(v_email));
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('poll:invite', v_target);
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  INSERT INTO public.poll_subscriptions (owner_id, subscriber_user_id, subscriber_email, status)
  VALUES (auth.uid(), v_user_id, CASE WHEN v_user_id IS NULL THEN v_email ELSE NULL END, 'pending')
  RETURNING id, token INTO v_id, v_token;

  PERFORM public.mail_cooldown_reserve('poll:invite', v_target);

  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'id', v_id, 'token', v_token,
    'channel', CASE WHEN v_user_id IS NOT NULL THEN 'onsite' ELSE 'email' END,
    'email', CASE WHEN v_user_id IS NULL THEN v_email ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_share_key text;
  v_created int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_blocked int := 0;
  v_blocked_sub_ids jsonb := '[]'::jsonb;
  v_mail jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT g.type::text, g.share_key_poll INTO v_poll_type, v_share_key
  FROM public.games g WHERE g.id = p_game_id AND g.owner_id = v_uid LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'game not found');
  END IF;
  IF v_poll_type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not a poll game');
  END IF;

  UPDATE public.poll_tasks t
  SET status = 'cancelled', cancelled_at = now()
  WHERE t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened')
    AND (
      (t.recipient_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.poll_subscriptions s
        WHERE s.id = ANY(coalesce(p_sub_ids, array[]::uuid[])) AND s.owner_id = v_uid
          AND s.status = 'active' AND s.subscriber_user_id = t.recipient_user_id
      ))
      OR (t.recipient_user_id IS NULL AND t.recipient_email IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.poll_subscriptions s
        WHERE s.id = ANY(coalesce(p_sub_ids, array[]::uuid[])) AND s.owner_id = v_uid
          AND s.status = 'active' AND s.subscriber_email IS NOT NULL
          AND lower(s.subscriber_email) = lower(t.recipient_email)
      ))
    );
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  WITH sel AS (
    SELECT
      s.id AS sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) AS subscriber_email,
      lower(coalesce(s.subscriber_email, p.email)) AS resolved_email,
      'pair:' || v_uid::text || ':' ||
        coalesce(s.subscriber_user_id::text, 'email:' || md5(lower(coalesce(s.subscriber_email, '')))) ||
        ':game:' || p_game_id::text AS cooldown_target
    FROM public.poll_subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.subscriber_user_id
    WHERE s.owner_id = v_uid AND s.status = 'active' AND s.id = ANY(coalesce(p_sub_ids, array[]::uuid[]))
  ),
  cooldown AS (
    SELECT sel.sub_id, mc.next_allowed_at
    FROM sel
    JOIN public.mail_cooldowns mc ON mc.action_key = 'poll:share' AND mc.target_key = sel.cooldown_target
    WHERE mc.next_allowed_at > now()
  ),
  existing AS (
    SELECT sel.sub_id, t.id AS task_id
    FROM sel
    LEFT JOIN public.poll_tasks t
      ON t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened', 'done')
     AND ((sel.subscriber_user_id IS NOT NULL AND t.recipient_user_id = sel.subscriber_user_id)
       OR (sel.subscriber_user_id IS NULL AND sel.subscriber_email IS NOT NULL AND lower(t.recipient_email) = sel.subscriber_email))
  ),
  to_insert AS (
    SELECT sel.* FROM sel
    JOIN existing ex ON ex.sub_id = sel.sub_id
    LEFT JOIN cooldown cd ON cd.sub_id = sel.sub_id
    WHERE ex.task_id IS NULL AND cd.sub_id IS NULL
  ),
  ins AS (
    INSERT INTO public.poll_tasks(owner_id, recipient_user_id, recipient_email, game_id, poll_type, share_key_poll, token, status, created_at)
    SELECT
      v_uid, e.subscriber_user_id,
      CASE WHEN e.subscriber_user_id IS NOT NULL THEN NULL ELSE e.resolved_email END,
      p_game_id, v_poll_type, v_share_key, gen_random_uuid(), 'pending', now()
    FROM to_insert e
    RETURNING id, recipient_user_id, recipient_email, token
  ),
  reserved AS (
    -- Rezerwacja cooldownu TYLKO dla wierszy, które faktycznie przeszły
    -- przez `ins` (czyli naprawdę zostały wstawione) -- nie wcześniej,
    -- żeby nie konsumować cooldownu dla zablokowanych/już-istniejących.
    SELECT r.id, pc.ok
    FROM ins r
    CROSS JOIN LATERAL public.mail_cooldown_reserve(
      'poll:share',
      'pair:' || v_uid::text || ':' ||
        coalesce(r.recipient_user_id::text, 'email:' || md5(lower(coalesce(r.recipient_email, '')))) ||
        ':game:' || p_game_id::text
    ) pc
  ),
  mail_rows AS (
    SELECT i.id, coalesce(lower(i.recipient_email), lower(p.email)) AS to_email, i.token
    FROM ins i
    JOIN reserved rv ON rv.id = i.id AND rv.ok
    LEFT JOIN public.profiles p ON p.id = i.recipient_user_id
  )
  SELECT
    (SELECT count(*) FROM ins)::int,
    (SELECT count(*) FROM cooldown)::int,
    coalesce((SELECT jsonb_agg(jsonb_build_object('sub_id', c.sub_id, 'cooldown_until', c.next_allowed_at)) FROM cooldown c), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('task_id', id, 'to', to_email, 'token', token, 'link', ('poll-go?t=' || token::text)))
      FILTER (WHERE public._norm_email(to_email) IS NOT NULL), '[]'::jsonb)
  INTO v_created, v_blocked, v_blocked_sub_ids, v_mail
  FROM mail_rows;

  v_kept := greatest(coalesce(array_length(p_sub_ids, 1), 0) - v_created, 0);

  RETURN jsonb_build_object(
    'ok', true, 'created', v_created, 'cancelled', v_cancelled, 'kept', v_kept,
    'blocked', v_blocked, 'blocked_sub_ids', v_blocked_sub_ids, 'mail', v_mail
  );
END;
$$;
