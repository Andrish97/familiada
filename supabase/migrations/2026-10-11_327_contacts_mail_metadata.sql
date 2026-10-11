-- E19 krok 7: metadata kontaktów bez zmiany kontraktów używanych w udostępnianiu.
-- Pierwsze przypomnienie znajomości respektuje także rezerwację pierwszego maila.
BEGIN;

CREATE OR REPLACE FUNCTION public._contact_mail_enabled(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT coalesce((SELECT f.email_notifications FROM auth.users u
    JOIN public.user_flags f ON f.user_id=u.id
    WHERE lower(trim(u.email))=lower(trim(p_email)) LIMIT 1),true);
$$;
REVOKE ALL ON FUNCTION public._contact_mail_enabled(text) FROM PUBLIC,anon,authenticated;

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
      'email_enabled',v_enabled,'resend_available_at',v_until));
  END LOOP;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.contacts_list(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contacts_list(text) TO authenticated;

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

  SELECT * INTO v_f FROM public.friendships WHERE id = p_id AND requester_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  IF v_f.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'only pending can be resent');
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


COMMIT;
