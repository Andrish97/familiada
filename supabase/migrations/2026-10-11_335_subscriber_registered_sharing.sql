-- Konto korzysta ze Znajomych również po wcześniejszej anonimowej akceptacji.
BEGIN;
CREATE OR REPLACE FUNCTION "public"."poll_share_send"("p_game_id" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_game public.games%rowtype; r record;
  v_target text; v_ok boolean; v_until timestamptz; v_id uuid; v_token uuid;
  v_created int:=0; v_kept int:=0; v_blocked int:=0; v_mail jsonb:='[]';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','game not found'); END IF;
  IF v_game.type::text NOT IN ('poll_text','poll_points') OR v_game.status::text<>'poll_open' THEN
    RETURN jsonb_build_object('ok',false,'err','poll not open');
  END IF;
  FOR r IN
    SELECT p.id AS user_id,lower(trim(p.email)) AS email FROM public.profiles p
      WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND public.are_friends(v_uid,p.id)
    UNION
    SELECT NULL::uuid,lower(trim(s.subscriber_email)) FROM public.poll_subscriptions s
      WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[])) AND s.owner_id=v_uid
        AND s.subscriber_user_id IS NULL AND s.status='active'
        AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE lower(trim(p.email))=lower(trim(s.subscriber_email)) AND NOT p.is_guest)
  LOOP
    IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.owner_id=v_uid AND t.game_id=p_game_id
      AND t.share_key_poll=v_game.share_key_poll AND (t.recipient_user_id=r.user_id OR lower(trim(t.recipient_email))=r.email)) THEN
      v_kept:=v_kept+1; CONTINUE;
    END IF;
    v_target:='pair:'||v_uid::text||':'||coalesce(r.user_id::text,'email:'||md5(r.email))||':game:'||p_game_id::text;
    v_until:=public._poll_daily_cap_until(v_uid,r.email);
    SELECT ok INTO v_ok FROM public.mail_cooldown_check('poll:share',v_target);
    IF NOT v_ok OR v_until IS NOT NULL THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    SELECT ok INTO v_ok FROM public.mail_cooldown_reserve('poll:share',v_target);
    IF NOT v_ok THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll,token,status)
      VALUES(v_uid,r.user_id,CASE WHEN r.user_id IS NULL THEN r.email END,p_game_id,v_game.type::text,v_game.share_key_poll,gen_random_uuid(),'pending')
      RETURNING id,token INTO v_id,v_token;
    v_created:=v_created+1;
    v_mail:=v_mail||jsonb_build_array(jsonb_build_object('task_id',v_id,'to',r.email,'token',v_token,'link','go?t='||v_token::text));
  END LOOP;
  RETURN jsonb_build_object('ok',true,'created',v_created,'kept',v_kept,'blocked',v_blocked,'mail',v_mail);
END; $$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_share_poll"("p_game_id" "uuid", "p_sub_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_status text; -- E11b
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

  SELECT g.type::text, g.share_key_poll, g.status::text INTO v_poll_type, v_share_key, v_status
  FROM public.games g WHERE g.id = p_game_id AND g.owner_id = v_uid LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'game not found');
  END IF;
  IF v_poll_type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not a poll game');
  END IF;
  -- E11b: udostępniać można tylko otwartą ankietę (sprawdzane w bazie)
  IF v_status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  -- E11b: wycofanie zaproszenia = usunięcie wiersza (bez stanu 'cancelled'); czekające nie mają głosów
  DELETE FROM public.poll_tasks t
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
      AND s.subscriber_user_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.profiles registered
        WHERE public._norm_email(registered.email)=public._norm_email(s.subscriber_email) AND NOT registered.is_guest)
  ),
  cooldown AS (
    -- E11b: blokada = cooldown poll:share (24 h na parę+grę) LUB dobowy limit 3 maili ankietowych nadawca→odbiorca
    SELECT u.sub_id, max(u.next_allowed_at) AS next_allowed_at
    FROM (
      SELECT sel.sub_id, mc.next_allowed_at
      FROM sel
      JOIN public.mail_cooldowns mc ON mc.action_key = 'poll:share' AND mc.target_key = sel.cooldown_target
      WHERE mc.next_allowed_at > now()
      UNION ALL
      SELECT sel.sub_id, public._poll_daily_cap_until(v_uid, sel.resolved_email)
      FROM sel
      WHERE sel.resolved_email IS NOT NULL
        AND public._poll_daily_cap_until(v_uid, sel.resolved_email) IS NOT NULL
    ) u
    GROUP BY u.sub_id
  ),
  existing AS (
    SELECT sel.sub_id, t.id AS task_id
    FROM sel
    LEFT JOIN public.poll_tasks t
      ON t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened', 'done', 'declined') /* E11b: odrzucone = nic więcej w tym uruchomieniu */
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
    coalesce(jsonb_agg(jsonb_build_object('task_id', id, 'to', to_email, 'token', token, 'link', ('go?t=' || token::text)))
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
COMMIT;
