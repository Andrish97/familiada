-- E19 krok 5: zaproszenia do baz idą przez wspólny resolver /go/.
-- Bazy są zawsze udostępniane istniejącemu kontu. Relacja znajomości jest
-- opcjonalnym skrótem w UI, nie warunkiem autoryzacji.

CREATE OR REPLACE FUNCTION public.base_share_by_email(p_base_id uuid, p_email text, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamptz, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_owner uuid;
  v_recipient uuid;
  v_norm_email text;
  v_base_name text;
  v_owner_label text;
  v_task public.base_share_tasks%rowtype;
  v_target text;
  v_cd_ok boolean;
  v_cd_until timestamptz;
BEGIN
  PERFORM public.base_share_tasks_cleanup();

  v_norm_email := lower(trim(p_email));

  SELECT owner_id, name INTO v_owner, v_base_name
  FROM public.question_bases
  WHERE id = p_base_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT id INTO v_recipient FROM public.profiles WHERE lower(email) = v_norm_email;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF v_recipient = v_owner THEN
    RETURN QUERY SELECT false, 'owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.question_base_shares s WHERE s.base_id = p_base_id AND s.user_id = v_recipient) THEN
    UPDATE public.question_base_shares SET role = p_role WHERE base_id = p_base_id AND user_id = v_recipient;
    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text, v_base_name, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  v_target := 'pair:' || v_owner::text || ':' || v_recipient::text || ':base:' || p_base_id::text;
  SELECT mcc.ok, mcc.next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('base:share', v_target) AS mcc;
  IF NOT v_cd_ok THEN
    RETURN QUERY SELECT false, 'cooldown', NULL::text, NULL::text, NULL::text, NULL::text, v_cd_until, v_recipient;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.base_share_tasks t
    WHERE t.owner_id = v_owner AND t.base_id = p_base_id AND t.recipient_user_id = v_recipient
      AND t.status IN ('pending', 'opened')
  ) THEN
    RETURN QUERY SELECT false, 'already_pending', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  SELECT coalesce(pr.username, pr.email) INTO v_owner_label FROM public.profiles pr WHERE pr.id = v_owner;

  INSERT INTO public.base_share_tasks(owner_id, base_id, recipient_user_id, recipient_email, role, status)
  VALUES (v_owner, p_base_id, v_recipient, v_norm_email, p_role, 'pending')
  RETURNING * INTO v_task;

  PERFORM public.mail_cooldown_reserve('base:share', v_target);

  RETURN QUERY
  SELECT true, NULL::text, v_norm_email, ('/go/?b=' || v_task.token::text), v_base_name, v_owner_label, NULL::timestamptz, v_recipient;
END;
$$;

-- Wyszukiwanie konta po nazwie lub e-mailu. Znajomość nie jest warunkiem
-- udostępnienia; to samo API obsługuje skrót znajomych po UUID.
CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid, p_user_lookup text, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamptz, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lookup text := lower(trim(p_user_lookup));
  v_recipient uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.question_bases qb WHERE qb.id = p_base_id AND qb.owner_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT pr.id INTO v_recipient
  FROM public.profiles pr
  WHERE lower(trim(pr.email)) = v_lookup OR lower(trim(pr.username)) = v_lookup
  ORDER BY CASE WHEN lower(trim(pr.email)) = v_lookup THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.base_share_by_user(p_base_id, v_recipient, p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid, p_recipient_user_id uuid, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamptz, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_owner uuid;
  v_recipient uuid;
  v_base_name text;
  v_owner_label text;
  v_norm_email text;
  v_task public.base_share_tasks%rowtype;
  v_target text;
  v_cd_ok boolean;
  v_cd_until timestamptz;
BEGIN
  PERFORM public.base_share_tasks_cleanup();

  v_recipient := p_recipient_user_id;

  SELECT owner_id, name INTO v_owner, v_base_name FROM public.question_bases WHERE id = p_base_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF v_recipient = v_owner THEN
    RETURN QUERY SELECT false, 'owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT nullif(lower(trim(pr.email)), '') INTO v_norm_email FROM public.profiles pr WHERE pr.id = v_recipient;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.question_base_shares s WHERE s.base_id = p_base_id AND s.user_id = v_recipient) THEN
    UPDATE public.question_base_shares SET role = p_role WHERE base_id = p_base_id AND user_id = v_recipient;
    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text, v_base_name, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  v_target := 'pair:' || v_owner::text || ':' || v_recipient::text || ':base:' || p_base_id::text;
  SELECT mcc.ok, mcc.next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('base:share', v_target) AS mcc;
  IF NOT v_cd_ok THEN
    RETURN QUERY SELECT false, 'cooldown', NULL::text, NULL::text, NULL::text, NULL::text, v_cd_until, v_recipient;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.base_share_tasks t
    WHERE t.owner_id = v_owner AND t.base_id = p_base_id AND t.recipient_user_id = v_recipient
      AND t.status IN ('pending', 'opened')
  ) THEN
    RETURN QUERY SELECT false, 'already_pending', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  SELECT coalesce(pr.username, pr.email) INTO v_owner_label FROM public.profiles pr WHERE pr.id = v_owner;

  INSERT INTO public.base_share_tasks(owner_id, base_id, recipient_user_id, recipient_email, role, status)
  VALUES (v_owner, p_base_id, v_recipient, v_norm_email, p_role, 'pending')
  RETURNING * INTO v_task;

  PERFORM public.mail_cooldown_reserve('base:share', v_target);

  RETURN QUERY
  SELECT true, NULL::text, v_norm_email, ('/go/?b=' || v_task.token::text), v_base_name, v_owner_label, NULL::timestamptz, v_recipient;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  t record;
  u record;
  f record;
  b record;
BEGIN
  -- Znajomość przed subskrypcją: stare tokeny z maili kont skopiowano w 320.
  SELECT fs.id,fs.status,fs.requester_id,fs.addressee_id,p.username AS owner_label
  INTO f FROM public.friendships fs JOIN public.profiles p ON p.id=fs.requester_id
  WHERE fs.token=p_token LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'kind','friend','id',f.id,'status',f.status,
      'owner_label',f.owner_label,'recipient_matches_me',auth.uid()=f.addressee_id);
  END IF;
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
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'poll_stopped' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      UPDATE public.poll_tasks SET opened_at = now() WHERE id = t.id;
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

  -- Base shares: token is only a pointer to the logged-in recipient's task.
  SELECT bt.id, bt.status, bt.base_id, bt.recipient_user_id, bt.recipient_email,
         bt.owner_id, p.username AS owner_label
  INTO b
  FROM public.base_share_tasks bt
  LEFT JOIN public.profiles p ON p.id = bt.owner_id
  WHERE bt.token = p_token
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'base', 'task_id', b.id, 'status', b.status,
      'base_id', b.base_id, 'recipient_user_id', b.recipient_user_id,
      'recipient_email', b.recipient_email, 'owner_id', b.owner_id,
      'owner_label', b.owner_label,
      'recipient_matches_me', auth.uid() = b.recipient_user_id
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
