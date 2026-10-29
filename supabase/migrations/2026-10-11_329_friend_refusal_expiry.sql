-- E19: odmowa bez przypomnień, undo odbiorcy, widoczność 5/30 dni.
BEGIN;
CREATE OR REPLACE FUNCTION public.friends_invite(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_h        text := trim(coalesce(p_handle, ''));
  v_is_email boolean := position('@' in trim(coalesce(p_handle, ''))) > 1;
  v_prof     public.profiles%rowtype;
  v_ex       public.friendships%rowtype;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_id       uuid;
  v_token    uuid;
  v_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty handle');
  END IF;

  SELECT * INTO v_prof
  FROM public.profiles p
  WHERE (lower(p.username) = lower(v_h) OR lower(p.email) = lower(v_h))
    AND NOT p.is_guest
  ORDER BY (lower(p.username) = lower(v_h)) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'unknown_user', 'has_email_only', v_is_email);
  END IF;

  IF v_prof.id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'err', 'self');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(v_uid,v_prof.id)::text||':'||GREATEST(v_uid,v_prof.id)::text,329));
  SELECT * INTO v_ex
  FROM public.friendships f
  WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(v_uid, v_prof.id)
    AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(v_uid, v_prof.id);

  -- Serialize both spellings/directions of an unordered account pair.
  IF FOUND THEN
    IF v_ex.status='declined' AND v_ex.declined_at<=now()-interval '30 days' THEN
      DELETE FROM public.friendships WHERE id=v_ex.id;
    ELSE
      RETURN jsonb_build_object('ok',false,'err','already','id',v_ex.id,
        'status',v_ex.status,'direction',CASE WHEN v_ex.status='active' THEN 'friend'
          WHEN v_ex.addressee_id=v_uid THEN 'incoming' ELSE 'outgoing' END);
    END IF;
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_prof.id::text;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite_after_reject', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until, 'reason', 'after_reject');
  END IF;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until, 'reason', 'invite');
  END IF;

  v_enabled:=public._contact_mail_enabled(v_prof.email);
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status, email_sent_at, email_send_count)
    VALUES (v_uid,v_prof.id,'pending',CASE WHEN v_enabled THEN now() END,CASE WHEN v_enabled THEN 1 ELSE 0 END)
    RETURNING id, token INTO v_id, v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'err', 'already');
  END;

  IF v_enabled THEN PERFORM public.mail_cooldown_reserve('friend:invite',v_target); END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'to', v_prof.email, 'mail_allowed', v_enabled,
                            'accepted', false, 'status', 'pending');
END;
$$;
CREATE OR REPLACE FUNCTION public.friends_accept(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  UPDATE public.friendships
     SET status = 'active', accepted_at = now(), declined_at = NULL
   WHERE id = p_id AND addressee_id = v_uid AND status='pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', 'accepted', 'id', p_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.friends_reject(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  UPDATE public.friendships SET status='declined',declined_at=coalesce(declined_at,now())
   WHERE id = p_id AND addressee_id = v_uid AND status = 'pending'
  RETURNING requester_id INTO v_req;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  PERFORM public._friend_drop_pair_tasks(v_req, v_uid);
  -- blokada ponownego zaproszenia od zapraszającego na 30 dni
  PERFORM public.mail_cooldown_reserve('friend:invite_after_reject', 'pair:' || v_req::text || ':' || v_uid::text);
  RETURN jsonb_build_object('ok', true, 'action', 'rejected', 'id', p_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.friends_cancel(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_addr uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  DELETE FROM public.friendships
   WHERE id = p_id AND requester_id = v_uid AND status IN ('pending','declined')
  RETURNING addressee_id INTO v_addr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  PERFORM public._friend_drop_pair_tasks(v_uid, v_addr);
  RETURN jsonb_build_object('ok', true, 'action', 'cancelled', 'id', p_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.friends_resend(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_f        public.friendships%rowtype;
  v_to       text;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_lim      timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT * INTO v_f FROM public.friendships WHERE id = p_id AND requester_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  IF v_f.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'err',CASE WHEN v_f.status='declined' THEN 'declined' ELSE 'not_pending' END);
  END IF;

  SELECT lower(p.email) INTO v_to FROM public.profiles p WHERE p.id = v_f.addressee_id;
  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok', true, 'mail_allowed', false);
  END IF;

  v_lim := public._friend_mail_limit_until(v_uid, v_f.addressee_id);
  IF v_lim IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_f.addressee_id::text;
  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:resend', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT lower(p.email) INTO v_to FROM public.profiles p WHERE p.id = v_f.addressee_id;
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this user');
  END IF;

  UPDATE public.friendships
     SET email_sent_at = now(), email_send_count = email_send_count + 1
   WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('friend:resend', v_target);

  RETURN jsonb_build_object('ok', true, 'to', v_to, 'kind', 'friend_invite',
                            'link', 'go?f=' || v_f.token::text, 'token', v_f.token);
END;
$$;


CREATE OR REPLACE FUNCTION public.contacts_list(p_kind text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_row jsonb; v_rows jsonb; v_result jsonb:='[]';
  v_target text; v_until timestamptz; v_enabled boolean; v_declined_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  IF p_kind='friends' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO v_rows FROM public.friends_list() f;
  ELSIF p_kind='subscribers' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO v_rows FROM public.subscribers_list() s;
  ELSE RETURN jsonb_build_object('ok',false,'err','invalid_kind'); END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_until:=NULL; v_declined_at:=NULL;
    IF p_kind='friends' THEN
      SELECT declined_at INTO v_declined_at FROM public.friendships WHERE id=(v_row->>'id')::uuid;
    END IF;
    v_enabled:=public._contact_mail_enabled(v_row->>'email');
    IF v_row->>'status'='pending' AND (p_kind='subscribers' OR v_row->>'direction'='outgoing') THEN
      IF p_kind='friends' THEN
        v_target:='pair:'||v_uid::text||':'||(v_row->>'user_id');
        SELECT greatest(max(next_allowed_at),public._friend_mail_limit_until(v_uid,(v_row->>'user_id')::uuid))
          INTO v_until FROM public.mail_cooldowns
          WHERE target_key=v_target AND action_key IN ('friend:invite','friend:resend');
      ELSE
        v_target:='pair:'||v_uid::text||':email:'||md5(lower(trim(v_row->>'email')));
        SELECT greatest(max(next_allowed_at),public._poll_sub_mail_limit_until(v_uid,NULL,v_row->>'email'))
          INTO v_until FROM public.mail_cooldowns
          WHERE target_key=v_target AND action_key='poll:resend';
      END IF;
      IF v_until<=now() THEN v_until:=NULL; END IF;
    END IF;
    v_result:=v_result||jsonb_build_array(v_row||jsonb_build_object(
      'email_enabled',v_enabled,'resend_available_at',v_until,
      'declined_at',v_declined_at,'decline_expires_at',v_declined_at+interval '30 days'));
  END LOOP;
  RETURN v_result;
END; $$;
CREATE OR REPLACE FUNCTION "public"."friends_list"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "label" "text", "email" "text", "status" "text", "direction" "text", "created_at" timestamp with time zone, "accepted_at" timestamp with time zone, "email_sent_at" timestamp with time zone, "email_send_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT f.id,
         p.id,
         coalesce(nullif(p.username, ''), p.email),
         p.email,
         f.status,
         CASE WHEN f.status = 'active' THEN 'friend'
              WHEN f.requester_id = v_uid THEN 'outgoing'
              ELSE 'incoming' END,
         f.created_at, f.accepted_at, f.email_sent_at, f.email_send_count
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END
  WHERE (f.requester_id=v_uid OR f.addressee_id=v_uid)
    AND (f.status<>'declined' OR (f.declined_at>now()-interval '30 days'
      AND (f.addressee_id=v_uid OR f.declined_at>now()-interval '5 days')))
  ORDER BY f.created_at DESC;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."friends_token_info"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_f     public.friendships%rowtype;
  v_label text;
BEGIN
  SELECT * INTO v_f FROM public.friendships WHERE token=p_token
    AND (status<>'declined' OR declined_at>now()-interval '30 days');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  SELECT coalesce(nullif(p.username, ''), p.email) INTO v_label
  FROM public.profiles p WHERE p.id = v_f.requester_id;
  RETURN jsonb_build_object(
    'ok', true,
    'status', v_f.status,
    'requester_label', v_label,
    'addressee_matches_me', (auth.uid() IS NOT NULL AND v_f.addressee_id = auth.uid())
  );
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
  WHERE fs.token=p_token AND (fs.status<>'declined' OR fs.declined_at>now()-interval '30 days') LIMIT 1;
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
CREATE OR REPLACE FUNCTION public.friends_undo_reject(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_f public.friendships%rowtype;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  SELECT * INTO v_f FROM public.friendships WHERE id=p_id AND addressee_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
  IF v_f.status<>'declined' THEN RETURN jsonb_build_object('ok',false,'err','not_declined'); END IF;
  IF v_f.declined_at<=now()-interval '30 days' THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
  -- Keep the original refusal timestamp, token and mail counters.
  UPDATE public.friendships SET status='pending' WHERE id=p_id;
  RETURN jsonb_build_object('ok',true,'id',p_id,'status','pending');
END; $$;
REVOKE ALL ON FUNCTION public.friends_undo_reject(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.friends_undo_reject(uuid) TO authenticated;
COMMIT;
