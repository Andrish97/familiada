-- LOCAL DRAFT: anonymous source parent guard; account mail-off still means mail only.

CREATE OR REPLACE FUNCTION "public"."subscribers_invite"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
 v_uid uuid:=auth.uid(); v_email text:=public._norm_email(p_email);
 v_id uuid; v_token uuid; v_ok boolean; v_until timestamptz; v_target text; v_enabled boolean;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[v_email],ARRAY[v_uid]);
 IF v_email IS NULL OR v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' THEN
   RETURN jsonb_build_object('ok',false,'err','invalid_email');
 END IF;
 IF public._poll_registered_uid(v_email) IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 IF NOT public._contact_mail_enabled(v_email) THEN RETURN jsonb_build_object('ok',false,'err','notifications_disabled','mail_allowed',false); END IF;
 PERFORM public._subscriber_pair_lock(v_uid,v_email);
 SELECT id,token INTO v_id,v_token FROM public.poll_subscriptions
   WHERE owner_id=v_uid AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND lower(trim(subscriber_email))=v_email
     AND status IN ('pending','active') LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true,'id',v_id,'token',v_token); END IF;
 v_until:=public._subscriber_refusal_until(v_uid,v_email);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','after_reject'); END IF;
 v_target:='pair:'||v_uid::text||':email:'||md5(v_email);
 -- The refusal window is relational and applies also when mail is disabled.
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite_after_reject',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 v_enabled:=public._contact_mail_enabled(v_email);
 IF v_enabled THEN
   v_until:=public._poll_sub_mail_limit_until(v_uid,NULL,v_email);
   IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
   SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
   IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status)
   VALUES(v_uid,v_email,'pending') RETURNING id,token INTO v_id,v_token;
 IF v_enabled THEN PERFORM public.mail_cooldown_reserve('poll:invite',v_target); END IF;
 RETURN jsonb_build_object('ok',true,'already',false,'id',v_id,'token',v_token,'mail_allowed',v_enabled);
END; $_$;

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
  IF v_recipient IS NULL AND NOT public._contact_mail_enabled(v_email) THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
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
    AS $_$
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
  IF v_recipient IS NULL AND NOT public._contact_mail_enabled(v_email) THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
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
END $_$;

CREATE OR REPLACE FUNCTION "public"."poll_share_send"("p_game_id" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_game public.games%rowtype; r record;
  v_target text; v_ok boolean; v_until timestamptz; v_id uuid; v_token uuid;
  v_mail_enabled boolean;
  v_created int:=0; v_kept int:=0; v_blocked int:=0; v_mail jsonb:='[]';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  PERFORM public._poll_share_contact_locks(v_uid,p_friend_ids,p_subscriber_ids);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','game not found'); END IF;
  IF v_game.type::text NOT IN ('poll_text','poll_points') OR v_game.status::text<>'poll_open' THEN
    RETURN jsonb_build_object('ok',false,'err','poll not open');
  END IF;
  FOR r IN
    SELECT p.id AS user_id,(SELECT public._norm_email(email) FROM auth.users WHERE id=p.id) AS email,NULL::uuid AS source_subscription_id FROM public.profiles p
      WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND NOT p.is_guest AND public.are_friends(v_uid,p.id)
    UNION
    SELECT NULL::uuid,lower(trim(s.subscriber_email)),s.id AS source_subscription_id FROM public.poll_subscriptions s
      WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[])) AND s.owner_id=v_uid
        AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND s.status='active'
        AND public._poll_registered_uid(s.subscriber_email) IS NULL
  LOOP
    IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.owner_id=v_uid AND t.game_id=p_game_id
      AND t.share_key_poll=v_game.share_key_poll AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL) AND (t.recipient_user_id=r.user_id OR lower(trim(t.recipient_email))=r.email)) THEN
      v_kept:=v_kept+1; CONTINUE;
    END IF;
    v_target:='pair:'||v_uid::text||':'||coalesce(r.user_id::text,'email:'||md5(r.email))||':game:'||p_game_id::text;
    v_mail_enabled:=public._contact_mail_enabled(r.email);
    IF r.user_id IS NULL AND NOT v_mail_enabled THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    IF v_mail_enabled THEN
    v_until:=public._poll_daily_cap_until(v_uid,r.email);
    SELECT ok INTO v_ok FROM public.mail_cooldown_check('poll:share',v_target);
    IF NOT v_ok OR v_until IS NOT NULL THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    SELECT ok INTO v_ok FROM public.mail_cooldown_reserve('poll:share',v_target);
    IF NOT v_ok THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    END IF;
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll,token,status,source_subscription_id)
      VALUES(v_uid,r.user_id,CASE WHEN r.user_id IS NULL THEN r.email END,p_game_id,v_game.type::text,v_game.share_key_poll,gen_random_uuid(),'pending',r.source_subscription_id)
      RETURNING id,token INTO v_id,v_token;
    v_created:=v_created+1;
    IF v_mail_enabled THEN
    v_mail:=v_mail||jsonb_build_array(jsonb_build_object('task_id',v_id,'to',r.email,'token',v_token,'link','/go/?t='||v_token::text));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'created',v_created,'kept',v_kept,'blocked',v_blocked,'mail',v_mail);
END; $$;

CREATE OR REPLACE FUNCTION "public"."_poll_task_source_active"("p_task" "public"."poll_tasks") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT (p_task.recipient_user_id IS NOT NULL OR public._contact_mail_enabled(p_task.recipient_email)) AND (CASE p_task.source_kind
 WHEN 'subscriber' THEN EXISTS(SELECT 1 FROM public.poll_subscriptions s
  WHERE s.id=p_task.source_subscription_id AND s.owner_id=p_task.owner_id
  AND s.status='active' AND s.cancelled_at IS NULL AND s.declined_at IS NULL
  AND ((p_task.recipient_user_id IS NOT NULL AND coalesce(s.registered_user_id,s.subscriber_user_id)=p_task.recipient_user_id)
   OR (p_task.recipient_user_id IS NULL AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=public._norm_email(p_task.recipient_email))))
 WHEN 'friend' THEN EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=p_task.source_friendship_id
  AND f.status='active' AND f.cancelled_at IS NULL
  AND LEAST(f.requester_id,f.addressee_id)=LEAST(p_task.owner_id,p_task.recipient_user_id)
  AND GREATEST(f.requester_id,f.addressee_id)=GREATEST(p_task.owner_id,p_task.recipient_user_id))
 WHEN 'game' THEN true ELSE false END);
$$;

CREATE OR REPLACE FUNCTION "public"."poll_sub_accept_email"("p_token" "uuid", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  e text := public._norm_email(p_email);
  s public.poll_subscriptions%rowtype;
  deadline timestamptz;
BEGIN
  IF e IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','missing_email');
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
  IF FOUND THEN
    PERFORM public._poll_identity_email_refs(ARRAY[s.subscriber_email],ARRAY[s.owner_id,s.subscriber_user_id,s.registered_user_id,auth.uid()]);
    PERFORM public._subscriber_pair_lock(s.owner_id,s.subscriber_email);
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token');
  END IF;
  IF s.subscriber_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','registered_invite_requires_login');
  END IF;
  IF s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL OR s.status NOT IN ('pending','active') THEN
    RETURN jsonb_build_object('ok',false,'error','already_closed');
  END IF;
  -- Match the address also on idempotent acceptance of an active invitation.
  IF public._norm_email(s.subscriber_email) IS DISTINCT FROM e THEN
    RETURN jsonb_build_object('ok',false,'error','email_mismatch');
  END IF;
  IF s.registered_user_id IS NOT NULL OR public._poll_registered_uid(e) IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','has_account');
  END IF;
  IF NOT public._contact_mail_enabled(e) THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
  deadline:=public._subscriber_refusal_until(s.owner_id,e);
  IF deadline IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_until',deadline); END IF;
  IF s.status='active' THEN
    RETURN jsonb_build_object('ok',true,'kind','sub','action','accept','note','already_active');
  END IF;
  UPDATE public.poll_subscriptions SET status='active',
    accepted_at=coalesce(accepted_at,now()), opened_at=coalesce(opened_at,now())
    WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'kind','sub','action','accept');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."control_device_share_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE sh public.control_device_shares; t public.control_device_link_tokens;
        s public.control_runtime_sessions; v_game_name text; v_owner_name text;
BEGIN
  SELECT * INTO sh FROM public.control_device_shares WHERE token=p_token;
  IF FOUND THEN
    IF sh.recipient_id IS NULL AND NOT public._contact_mail_enabled(sh.recipient_email) THEN RETURN jsonb_build_object('ok',false,'state','revoked'); END IF;
    SELECT * INTO s FROM public.control_runtime_sessions WHERE id=sh.session_id;
    IF sh.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'state','revoked'); END IF;
    IF NOT FOUND OR s.ended_at IS NOT NULL OR s.expires_at<=now() THEN
      IF FOUND AND s.ended_at IS NULL AND s.expires_at<=now() THEN PERFORM public.control_runtime_expire_one(s.id); END IF;
      RETURN jsonb_build_object('ok',false,'state','expired');
    END IF;
    SELECT g.name,p.username INTO v_game_name,v_owner_name FROM public.games g
      LEFT JOIN public.profiles p ON p.id=g.owner_id WHERE g.id=sh.game_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','expired'); END IF;
    RETURN jsonb_build_object('ok',true,'state','active','kind','share','game_id',sh.game_id,
      'device_type',sh.device_type,'key',sh.token,'game_name',v_game_name,'owner_username',v_owner_name);
  END IF;

  SELECT * INTO t FROM public.control_device_link_tokens WHERE token=p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','invalid'); END IF;
  SELECT * INTO s FROM public.control_runtime_sessions WHERE id=t.session_id;
  IF NOT FOUND OR s.ended_at IS NOT NULL OR s.expires_at<=now() THEN
    IF FOUND AND s.ended_at IS NULL AND s.expires_at<=now() THEN PERFORM public.control_runtime_expire_one(s.id); END IF;
    RETURN jsonb_build_object('ok',false,'state','expired');
  END IF;
  SELECT g.name,p.username INTO v_game_name,v_owner_name FROM public.games g
    LEFT JOIN public.profiles p ON p.id=g.owner_id WHERE g.id=t.game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','expired'); END IF;
  RETURN jsonb_build_object('ok',true,'state','active','kind','pairing','game_id',t.game_id,
    'device_type',t.device_type,'key',t.token,'game_name',v_game_name,'owner_username',v_owner_name);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."control_device_key_valid"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE g public.games;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_device_type NOT IN ('display','host','buzzer') THEN RETURN false; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.control_device_link_tokens t
    JOIN public.control_runtime_sessions s ON s.id=t.session_id
    WHERE t.game_id=p_game_id AND t.device_type=p_device_type AND t.token::text=p_key
      AND s.ended_at IS NULL AND s.expires_at>now()
  ) OR EXISTS (
    SELECT 1 FROM public.control_device_shares sh
    JOIN public.control_runtime_sessions s ON s.id=sh.session_id
    WHERE sh.game_id=p_game_id AND sh.device_type=p_device_type AND sh.token::text=p_key
      AND (sh.recipient_id IS NOT NULL OR public._contact_mail_enabled(sh.recipient_email))
      AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
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
  task public.poll_tasks%rowtype;
  u record;
  f record;
  b record;
BEGIN
  -- Znajomość przed subskrypcją: stare tokeny z maili kont skopiowano w 320.
  SELECT fs.id,fs.status,fs.requester_id,fs.decision_user_id AS addressee_id,p.username AS owner_label
  INTO f FROM public.friendships fs JOIN public.profiles p ON p.id=CASE WHEN fs.decision_user_id=fs.requester_id THEN fs.addressee_id ELSE fs.requester_id END
  WHERE fs.token=p_token AND fs.cancelled_at IS NULL AND (fs.status<>'declined' OR fs.declined_at>now()-interval '30 days') LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'kind','friend','id',f.id,'status',f.status,
      'owner_label',f.owner_label,'recipient_matches_me',auth.uid()=f.addressee_id);
  END IF;
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at,ps.registered_user_id
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token AND (ps.declined_at IS NULL OR ps.declined_at>now()-interval '30 days') LIMIT 1;

  IF found THEN
    IF s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND NOT public._contact_mail_enabled(s.subscriber_email) THEN RETURN jsonb_build_object('ok',false,'error','revoked'); END IF;
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email,
      'friend_conversion_required', s.registered_user_id IS NOT NULL OR s.subscriber_user_id IS NOT NULL OR public._poll_registered_uid(s.subscriber_email) IS NOT NULL
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.owner_id AS game_owner, g.type::text AS game_type,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    IF t.recipient_user_id IS NULL AND NOT public._contact_mail_enabled(t.recipient_email) THEN RETURN jsonb_build_object('ok',false,'error','revoked'); END IF;
    IF t.game_key IS NULL OR t.game_key IS DISTINCT FROM t.share_key_poll
      OR t.owner_id IS DISTINCT FROM t.game_owner OR t.poll_type IS DISTINCT FROM t.game_type THEN
      RETURN jsonb_build_object('ok',false,'error','expired');
    END IF;
    SELECT * INTO task FROM public.poll_tasks WHERE id=t.id;
    IF NOT FOUND OR NOT public._poll_task_source_active(task) THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
    IF t.recipient_user_id IS NULL THEN
      t.recipient_user_id:=public._poll_registered_uid(t.recipient_email);
    END IF;
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
      PERFORM public._poll_task_change(p_token,'open');
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
    AND (bt.status NOT IN ('pending','opened','declined') OR coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')>now())
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

CREATE OR REPLACE FUNCTION public._mail_center_anon_source_insert_guard_prototype()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; owner uuid;
BEGIN
 IF TG_TABLE_NAME='poll_tasks' THEN
  IF NEW.recipient_user_id IS NOT NULL OR NEW.status NOT IN('pending','opened') THEN RETURN NEW; END IF;
  mailbox:=public._norm_email(NEW.recipient_email); owner:=NEW.owner_id;
 ELSIF TG_TABLE_NAME='poll_subscriptions' THEN
  IF NEW.subscriber_user_id IS NOT NULL OR NEW.registered_user_id IS NOT NULL OR NEW.status NOT IN('pending','active') THEN RETURN NEW; END IF;
  mailbox:=public._norm_email(NEW.subscriber_email); owner:=NEW.owner_id;
 ELSE
  IF NEW.recipient_id IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
  mailbox:=public._norm_email(NEW.recipient_email); owner:=NEW.owner_id;
 END IF;
 -- BEFORE INSERT has no existing child row lock. Established APIs already own
 -- these parent/identity locks; this also covers older service insertion paths.
 PERFORM public._poll_identity_email_refs(ARRAY[mailbox],ARRAY[owner]);
 IF public._poll_registered_uid(mailbox) IS NULL AND NOT public._contact_mail_enabled(mailbox) THEN
  RAISE EXCEPTION 'notifications_disabled' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._mail_center_anon_source_insert_guard_prototype() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_mail_center_anon_source_guard_prototype BEFORE INSERT ON public.poll_tasks
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_anon_source_insert_guard_prototype();
CREATE TRIGGER zz_mail_center_anon_source_guard_prototype BEFORE INSERT ON public.poll_subscriptions
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_anon_source_insert_guard_prototype();
CREATE TRIGGER zz_mail_center_anon_source_guard_prototype BEFORE INSERT ON public.control_device_shares
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_anon_source_insert_guard_prototype();
