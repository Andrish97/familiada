-- E19: actual account identity and mail preferences for Control invitations.
-- Additive lookup APIs; public pairing and existing active grants retain their lifecycle.
BEGIN;
DO $$ BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   LOCK auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.profiles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.friendships IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.games IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.control_runtime_sessions IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.control_device_shares IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.mail_queue IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.mail_cooldowns IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.email_unsub_tokens IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.user_flags IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.1);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION "public"."control_device_share_create"("p_game_id" "uuid", "p_device_type" "text", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
DECLARE
  v_uid uuid:=auth.uid(); v_owner uuid; v_session public.control_runtime_sessions;
  v_recipient uuid:=p_recipient_user_id; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_created public.control_device_shares; v_existing public.control_device_shares;
  v_target text; v_mail_email text; v_flag boolean:=true; v_mail_allowed boolean:=false; v_until timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  IF (p_recipient_user_id IS NOT NULL) = (p_recipient_email IS NOT NULL) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_required');
  END IF;
  IF p_recipient_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_email');
  END IF;

  IF v_email<>'' THEN v_recipient:=public._poll_registered_uid(v_email); END IF;
  PERFORM 1 FROM auth.users WHERE id=ANY(ARRAY[v_uid,v_recipient]) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF v_email<>'' AND public._poll_registered_uid(v_email) IS DISTINCT FROM v_recipient THEN RETURN jsonb_build_object('ok',false,'error','recipient_changed'); END IF;
  SELECT public._norm_email(u.email) INTO v_mail_email FROM auth.users u WHERE u.id=v_recipient;
  PERFORM public._poll_identity_email_refs(ARRAY[nullif(v_email,''),v_mail_email],ARRAY[v_uid,v_recipient]);
  IF v_email<>'' AND public._poll_registered_uid(v_email) IS DISTINCT FROM v_recipient THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_changed');
  END IF;
  IF v_recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_recipient AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_not_found');
  END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  SELECT * INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND owner_id=v_uid AND ended_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;

  IF v_recipient IS NOT NULL AND v_recipient=v_uid THEN RETURN jsonb_build_object('ok',false,'error','self_share'); END IF;
  IF v_recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_recipient) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_not_found');
  END IF;
  IF v_recipient IS NOT NULL THEN v_email:=''; END IF;

  SELECT * INTO v_existing FROM public.control_device_shares
  WHERE session_id=v_session.id AND device_type=p_device_type AND revoked_at IS NULL
    AND ((v_recipient IS NOT NULL AND recipient_id=v_recipient)
      OR (v_recipient IS NULL AND lower(recipient_email)=v_email))
  LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'created',false,'share_id',v_existing.id,
      'token',v_existing.token,'recipient_id',v_existing.recipient_id,
      'recipient_email',v_existing.recipient_email,'mail_allowed',false);
  END IF;

  INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_id,recipient_email,device_type)
  VALUES(v_session.id,p_game_id,v_uid,v_recipient,CASE WHEN v_recipient IS NULL THEN v_email END,p_device_type)
  RETURNING * INTO v_created;

  IF v_recipient IS NOT NULL THEN
    SELECT public._norm_email(u.email) INTO v_mail_email FROM auth.users u WHERE u.id=v_recipient;
    v_flag:=public._contact_mail_enabled(v_mail_email);
    v_target:='pair:'||v_uid::text||':'||v_recipient::text||':device:'||p_device_type||':game:'||p_game_id::text;
  ELSE
    v_flag:=public._contact_mail_enabled(v_email);
    v_target:='pair:'||v_uid::text||':'||md5(v_email)||':device:'||p_device_type||':game:'||p_game_id::text;
  END IF;
  IF v_flag THEN
    SELECT ok,next_allowed_at INTO v_mail_allowed,v_until
      FROM public.mail_cooldown_reserve('device:share',v_target);
  END IF;
  RETURN jsonb_build_object('ok',true,'created',true,'share_id',v_created.id,'token',v_created.token,
    'recipient_id',v_created.recipient_id,'recipient_email',v_created.recipient_email,
    'mail_allowed',v_mail_allowed,'mail_to',CASE WHEN v_flag THEN coalesce(v_mail_email,nullif(v_email,'')) END,'mail_disabled',NOT v_flag,
    'cooldown_until',v_until,'cooldown_target_key',v_target);
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."control_device_share_preflight"("p_game_id" "uuid", "p_device_type" "text", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_recipient uuid:=p_recipient_user_id; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_session uuid; v_target text; v_mail_email text; v_flag boolean:=true; v_ok boolean; v_until timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND public._poll_identity_regular(u.id,to_jsonb(u))) OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=v_uid) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF (p_recipient_user_id IS NOT NULL) = (p_recipient_email IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'error','recipient_required'); END IF;
  IF p_recipient_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_email'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  SELECT id INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND owner_id=v_uid AND ended_at IS NULL AND expires_at>now();
  IF v_session IS NULL THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;
  IF p_recipient_email IS NOT NULL THEN
    v_recipient:=public._poll_registered_uid(v_email);
  END IF;
  IF v_recipient=v_uid THEN RETURN jsonb_build_object('ok',false,'error','self_share'); END IF;
  IF v_recipient IS NOT NULL THEN
    SELECT public._norm_email(u.email) INTO v_mail_email FROM auth.users u WHERE u.id=v_recipient AND public._poll_identity_regular(u.id,to_jsonb(u));
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','recipient_not_found'); END IF;
    v_flag:=public._contact_mail_enabled(v_mail_email);
    v_target:='pair:'||v_uid::text||':'||v_recipient::text||':device:'||p_device_type||':game:'||p_game_id::text;
  ELSE
    v_flag:=public._contact_mail_enabled(v_email);
    v_target:='pair:'||v_uid::text||':'||md5(v_email)||':device:'||p_device_type||':game:'||p_game_id::text;
  END IF;
  IF EXISTS(SELECT 1 FROM public.control_device_shares WHERE session_id=v_session AND device_type=p_device_type
      AND revoked_at IS NULL AND ((v_recipient IS NOT NULL AND recipient_id=v_recipient)
        OR (v_recipient IS NULL AND recipient_email=v_email))) THEN
    RETURN jsonb_build_object('ok',true,'already_shared',true,'mail_disabled',NOT v_flag);
  END IF;
  IF v_flag THEN SELECT c.ok,c.next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('device:share',v_target) c; END IF;
  RETURN jsonb_build_object('ok',true,'already_shared',false,'mail_disabled',NOT v_flag,
    'mail_allowed',v_flag AND coalesce(v_ok,true),'cooldown_until',v_until);
END $$;

-- Canonical recipient lookup and explicit friend selection.
CREATE OR REPLACE FUNCTION public._control_share_recipient_lookup(p_game_id uuid,p_lookup text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); raw text:=lower(trim(p_lookup)); peer uuid; mail text;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u)))
 OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=uid)
 THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
 IF position('@' in raw)>0 THEN
  IF raw !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_email'); END IF;
  peer:=public._poll_registered_uid(raw); mail:=raw;
 ELSE
  SELECT u.id,public._norm_email(u.email) INTO peer,mail FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE lower(trim(p.username))=raw AND public._poll_identity_regular(u.id,to_jsonb(u));
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','unknown_user'); END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'recipient_id',peer,'email',mail,'by_email',position('@' in raw)>0);
END $$;
REVOKE ALL ON FUNCTION public._control_share_recipient_lookup(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.control_device_share_create_by_lookup(p_game_id uuid,p_device_type text,p_lookup text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE r jsonb;
BEGIN
 r:=public._control_share_recipient_lookup(p_game_id,p_lookup);
 IF r->>'ok'<>'true' THEN RETURN r; END IF;
 IF (r->>'by_email')::boolean THEN RETURN public.control_device_share_create(p_game_id,p_device_type,NULL,r->>'email'); END IF;
 RETURN public.control_device_share_create(p_game_id,p_device_type,(r->>'recipient_id')::uuid,NULL);
END $$;
CREATE OR REPLACE FUNCTION public.control_device_share_preflight_by_lookup(p_game_id uuid,p_device_type text,p_lookup text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE r jsonb;
BEGIN
 r:=public._control_share_recipient_lookup(p_game_id,p_lookup);
 IF r->>'ok'<>'true' THEN RETURN r; END IF;
 IF (r->>'by_email')::boolean THEN RETURN public.control_device_share_preflight(p_game_id,p_device_type,NULL,r->>'email'); END IF;
 RETURN public.control_device_share_preflight(p_game_id,p_device_type,(r->>'recipient_id')::uuid,NULL);
END $$;

CREATE OR REPLACE FUNCTION public.control_device_share_to_friend(p_game_id uuid,p_device_type text,p_friend_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); mail text;
BEGIN
 IF uid IS NULL OR p_friend_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u)))
 THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
 PERFORM 1 FROM auth.users WHERE id=ANY(ARRAY[uid,p_friend_id]) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
 SELECT public._norm_email(email) INTO mail FROM auth.users WHERE id=p_friend_id;
 PERFORM public._poll_identity_email_refs(ARRAY[mail],ARRAY[uid,p_friend_id]);
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(uid,p_friend_id)::text||':'||GREATEST(uid,p_friend_id)::text,329));
 PERFORM 1 FROM public.friendships f WHERE f.status='active' AND f.cancelled_at IS NULL
  AND ((f.requester_id=uid AND f.addressee_id=p_friend_id) OR(f.addressee_id=uid AND f.requester_id=p_friend_id)) FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_friend'); END IF;
 RETURN public.control_device_share_create(p_game_id,p_device_type,p_friend_id,NULL);
END $$;
REVOKE ALL ON FUNCTION public.control_device_share_create_by_lookup(uuid,text,text),public.control_device_share_preflight_by_lookup(uuid,text,text),public.control_device_share_to_friend(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_device_share_create_by_lookup(uuid,text,text),public.control_device_share_preflight_by_lookup(uuid,text,text),public.control_device_share_to_friend(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION "public"."mail_queue_notification_preference_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_notifications_enabled boolean;
BEGIN
  IF NEW.cooldown_action_key ~ '^(base|device|friend|poll):' AND NOT public._contact_mail_enabled(NEW.to_email) THEN RETURN NULL; END IF;
  SELECT COALESCE(uf.email_notifications, true)
    INTO v_notifications_enabled
  FROM auth.users u
  LEFT JOIN public.user_flags uf ON uf.user_id = u.id
  WHERE lower(trim(u.email)) = lower(trim(NEW.to_email))
  LIMIT 1;

  IF FOUND AND NOT v_notifications_enabled THEN
    -- Pominięcie insercji jest celowe: wyłączona preferencja nie tworzy
    -- oczekującego maila, ale też nie blokuje nadania samego dostępu.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.control_device_share_create(uuid,text,uuid,text),public.control_device_share_preflight(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_device_share_create(uuid,text,uuid,text),public.control_device_share_preflight(uuid,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.mail_queue_notification_preference_guard() FROM PUBLIC,anon,authenticated;
COMMIT;
