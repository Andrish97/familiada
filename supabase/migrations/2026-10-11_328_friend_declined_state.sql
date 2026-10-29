-- E19 krok 7: trwały stan odmowy znajomości. Wdrażać razem z UI.
BEGIN;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS declined_at timestamptz;
ALTER TABLE public.friendships DROP CONSTRAINT friendships_status_check;
ALTER TABLE public.friendships ADD CONSTRAINT friendships_status_check CHECK(status IN ('pending','active','declined'));
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

  SELECT * INTO v_ex
  FROM public.friendships f
  WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(v_uid, v_prof.id)
    AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(v_uid, v_prof.id);

  IF FOUND THEN
    IF v_ex.status IN ('pending','declined') AND v_ex.addressee_id = v_uid THEN
      -- Zaproszenie krzyżowe: druga strona już zaprosiła mnie — od razu aktywne, bez maila.
      UPDATE public.friendships
         SET status = 'active', accepted_at = now(), declined_at = NULL
       WHERE id = v_ex.id;
      RETURN jsonb_build_object('ok', true, 'id', v_ex.id, 'token', v_ex.token,
                                'to', v_prof.email, 'mail_allowed', false,
                                'accepted', true, 'status', 'active');
    END IF;
    RETURN jsonb_build_object('ok', false, 'err', 'already', 'id', v_ex.id, 'status', v_ex.status);
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

  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status, email_sent_at, email_send_count)
    VALUES (v_uid, v_prof.id, 'pending', now(), 1)
    RETURNING id, token INTO v_id, v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'err', 'already');
  END;

  PERFORM public.mail_cooldown_reserve('friend:invite', v_target);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'to', v_prof.email, 'mail_allowed', true,
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
   WHERE id = p_id AND addressee_id = v_uid AND status IN ('pending','declined');
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
  UPDATE public.friendships SET status='declined',declined_at=now()
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
  IF v_f.status NOT IN ('pending','declined') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'only pending or declined can be reminded');
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
  v_target text; v_until timestamptz; v_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  IF p_kind='friends' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO v_rows FROM public.friends_list() f;
  ELSIF p_kind='subscribers' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO v_rows FROM public.subscribers_list() s;
  ELSE RETURN jsonb_build_object('ok',false,'err','invalid_kind'); END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_until:=NULL;
    v_enabled:=public._contact_mail_enabled(v_row->>'email');
    IF v_row->>'status' IN ('pending','declined') AND (p_kind='subscribers' OR v_row->>'direction'='outgoing') THEN
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
      'email_enabled',v_enabled,'resend_available_at',v_until));
  END LOOP;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.contacts_list(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contacts_list(text) TO authenticated;


REVOKE ALL ON FUNCTION public.friends_invite(text), public.friends_accept(uuid),
 public.friends_reject(uuid), public.friends_cancel(uuid), public.friends_resend(uuid)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friends_invite(text), public.friends_accept(uuid),
 public.friends_reject(uuid), public.friends_cancel(uuid), public.friends_resend(uuid)
 TO authenticated;
COMMIT;
