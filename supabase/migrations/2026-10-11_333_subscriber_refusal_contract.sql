-- E19 pkt 3: wyłączone maile nie zużywają budżetu ani cooldownu.
-- Wypisanie = odmowa: 5 dni widoczności, 30 dni karencji; globalna flaga trwała.
BEGIN;
CREATE OR REPLACE FUNCTION public._contact_mail_enabled(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
 SELECT public._norm_email(p_email) IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.email_unsub_tokens
     WHERE lower(trim(email))=public._norm_email(p_email) AND suppressed_at IS NOT NULL)
   AND coalesce((SELECT f.email_notifications FROM auth.users u
     JOIN public.user_flags f ON f.user_id=u.id
     WHERE lower(trim(u.email))=public._norm_email(p_email) LIMIT 1),true);
$$;
REVOKE ALL ON FUNCTION public._contact_mail_enabled(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._subscriber_pair_lock(p_owner uuid,p_email text)
RETURNS void LANGUAGE sql SET search_path=public,pg_temp AS $$
 SELECT pg_advisory_xact_lock(hashtextextended(p_owner::text||':email:'||public._norm_email(p_email),333));
$$;
REVOKE ALL ON FUNCTION public._subscriber_pair_lock(uuid,text) FROM PUBLIC,anon,authenticated;


INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('poll:invite_after_reject','pair',2592000,true)
ON CONFLICT(action_key) DO UPDATE SET cooldown_seconds=excluded.cooldown_seconds,enforce=true;

CREATE OR REPLACE FUNCTION public._subscriber_refusal_until(p_owner uuid,p_email text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT greatest(max(s.declined_at)+interval '30 days',
   (SELECT max(next_allowed_at) FROM public.mail_cooldowns
    WHERE action_key='poll:invite_after_reject'
    AND target_key='pair:'||p_owner::text||':email:'||md5(public._norm_email(p_email))
    AND next_allowed_at>now())) FROM public.poll_subscriptions s
 LEFT JOIN public.profiles p ON p.id=s.subscriber_user_id
 WHERE s.owner_id=p_owner AND public._norm_email(coalesce(s.subscriber_email,p.email))=public._norm_email(p_email)
 AND s.declined_at>now()-interval '30 days';
$$;
REVOKE ALL ON FUNCTION public._subscriber_refusal_until(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._subscriber_close(p_token uuid,p_allow_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.poll_subscriptions%rowtype; e text;
BEGIN
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT public._norm_email(coalesce(s.subscriber_email,p.email)) INTO e
 FROM (SELECT 1) x LEFT JOIN public.profiles p ON p.id=s.subscriber_user_id;
 IF e IS NULL THEN RETURN false; END IF;
 PERFORM public._subscriber_pair_lock(s.owner_id,e);
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
 IF NOT FOUND OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL
 OR NOT (s.status='pending' OR (p_allow_active AND s.status='active')) THEN RETURN false; END IF;
 UPDATE public.poll_subscriptions SET status='declined',declined_at=now(),opened_at=coalesce(opened_at,now()) WHERE id=s.id;
 PERFORM public.mail_cooldown_reserve('poll:invite_after_reject','pair:'||s.owner_id::text||':email:'||md5(e));
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=now()
 WHERE owner_id=s.owner_id AND status IN ('pending','opened')
 AND ((s.subscriber_user_id IS NOT NULL AND recipient_user_id=s.subscriber_user_id)
 OR public._norm_email(recipient_email)=e);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public._subscriber_close(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.poll_go_sub_decline(p_token uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public._subscriber_close(p_token,false);
$$;
CREATE OR REPLACE FUNCTION public.poll_sub_unsubscribe(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.poll_subscriptions%rowtype; label text;
BEGIN
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF NOT public._subscriber_close(p_token,true) THEN RETURN jsonb_build_object('ok',false,'error','already_inactive'); END IF;
 SELECT username INTO label FROM public.profiles WHERE id=s.owner_id;
 RETURN jsonb_build_object('ok',true,'owner_label',coalesce(label,''));
END; $$;
CREATE OR REPLACE FUNCTION public.poll_go_global_unsubscribe(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e text; r record;
BEGIN
 SELECT public._norm_email(email) INTO e FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,now()) WHERE token=p_token;
 FOR r IN SELECT token FROM public.poll_subscriptions
 WHERE public._norm_email(subscriber_email)=e AND status IN ('pending','active') ORDER BY owner_id,id LOOP
   PERFORM public._subscriber_close(r.token,true);
 END LOOP;
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=now()
 WHERE public._norm_email(recipient_email)=e AND status IN ('pending','opened');
 RETURN jsonb_build_object('ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.subscribers_invite(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_uid uuid:=auth.uid(); v_email text:=public._norm_email(p_email);
 v_id uuid; v_token uuid; v_ok boolean; v_until timestamptz; v_target text; v_enabled boolean;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 IF v_email IS NULL OR v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' THEN
   RETURN jsonb_build_object('ok',false,'err','invalid_email');
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(trim(email))=v_email AND NOT is_guest) THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 PERFORM public._subscriber_pair_lock(v_uid,v_email);
 SELECT id,token INTO v_id,v_token FROM public.poll_subscriptions
   WHERE owner_id=v_uid AND subscriber_user_id IS NULL AND lower(trim(subscriber_email))=v_email
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
END; $$;

CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_resend(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); s public.poll_subscriptions%rowtype;
 v_to text; v_target text; v_ok boolean; v_until timestamptz; v_unsub uuid;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 v_to:=public._norm_email(s.subscriber_email);
 IF v_to IS NULL AND s.subscriber_user_id IS NOT NULL THEN
   SELECT public._norm_email(email) INTO v_to FROM public.profiles WHERE id=s.subscriber_user_id;
 END IF;
 IF v_to IS NULL THEN RETURN jsonb_build_object('ok',false,'err','no email for this subscriber'); END IF;
 -- Serialize the budget across separate historical rows for this same pair.
 PERFORM public._subscriber_pair_lock(v_uid,v_to);
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 IF s.status<>'pending' OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','only pending can be resent');
 END IF;
 IF s.subscriber_user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.profiles
     WHERE lower(trim(email))=v_to AND NOT is_guest) THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 v_until:=public._subscriber_refusal_until(v_uid,v_to);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','after_reject'); END IF;
 IF NOT public._contact_mail_enabled(v_to) THEN
   RETURN jsonb_build_object('ok',true,'mail_allowed',false);
 END IF;
 v_target:='pair:'||v_uid::text||':email:'||md5(v_to);
 v_until:=public._poll_sub_mail_limit_until(v_uid,NULL,v_to);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','mail_limit'); END IF;
 -- The first delivery follows the initial invitation reservation. Later ones
 -- must honor that reservation as well as the reminder reservation.
 IF s.email_send_count>0 THEN
   SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
   IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 END IF;
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:resend',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_reserve('poll:resend',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 UPDATE public.poll_subscriptions SET email_sent_at=now(),email_send_count=email_send_count+1 WHERE id=s.id;
 v_unsub:=public._ensure_unsub_token(v_to);
 RETURN jsonb_build_object('ok',true,'mail_allowed',true,'to',v_to,'kind','sub_invite',
   'link','/go/?s='||s.token,'token',s.token,'registered',false,'unsub_token',v_unsub);
END; $$;

-- contacts_list is appended below; preserve the Friends refusal contract.
CREATE OR REPLACE FUNCTION "public"."contacts_list"("p_kind" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
    ELSE
      SELECT declined_at INTO v_declined_at FROM public.poll_subscriptions WHERE id=(v_row->>'id')::uuid;
    END IF;
    v_enabled:=public._contact_mail_enabled(v_row->>'email')
      AND (p_kind<>'subscribers' OR v_row->>'friend_user_id' IS NULL);
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
          WHERE target_key=v_target AND action_key IN ('poll:invite','poll:resend');
      END IF;
      IF v_until<=now() THEN v_until:=NULL; END IF;
    END IF;
    v_result:=v_result||jsonb_build_array(v_row||jsonb_build_object(
      'email_enabled',v_enabled,'resend_available_at',v_until,
      'declined_at',v_declined_at,'decline_expires_at',v_declined_at+interval '30 days'));
  END LOOP;
  RETURN v_result;
END; $$;
CREATE OR REPLACE FUNCTION "public"."subscribers_list"() RETURNS TABLE("id" "uuid", "email" "text", "status" "text", "created_at" timestamp with time zone, "token" "uuid", "email_sent_at" timestamp with time zone, "email_send_count" integer, "friend_user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT s.id,s.subscriber_email,s.status,s.created_at,s.token,s.email_sent_at,s.email_send_count,
    (SELECT p.id FROM public.profiles p WHERE lower(trim(p.email))=lower(trim(s.subscriber_email)) AND NOT p.is_guest LIMIT 1)
  FROM public.poll_subscriptions s
  WHERE s.owner_id=auth.uid() AND s.subscriber_user_id IS NULL AND (s.status IN ('pending','active') OR (s.status='declined' AND s.declined_at>now()-interval '5 days'))
  ORDER BY s.created_at DESC;
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
  WHERE ps.token = p_token AND (ps.declined_at IS NULL OR ps.declined_at>now()-interval '30 days') LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email,
      'friend_conversion_required', s.subscriber_user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.profiles WHERE public._norm_email(email)=public._norm_email(s.subscriber_email) AND NOT is_guest)
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
  IF FOUND THEN PERFORM public._subscriber_pair_lock(s.owner_id,s.subscriber_email); END IF;
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
  IF EXISTS(SELECT 1 FROM public.profiles WHERE public._norm_email(email)=e AND NOT is_guest) THEN
    RETURN jsonb_build_object('ok',false,'error','has_account');
  END IF;
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

CREATE OR REPLACE FUNCTION public.poll_sub_accept(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.poll_subscriptions%rowtype; uid uuid:=auth.uid(); e text;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
 SELECT public._norm_email(email) INTO e FROM public.profiles WHERE id=uid;
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 IF (s.subscriber_user_id IS NOT NULL AND s.subscriber_user_id<>uid)
 OR (s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email) IS DISTINCT FROM e) THEN
   RETURN jsonb_build_object('ok',false,'error','not_your_invite'); END IF;
 IF s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL OR s.status NOT IN ('pending','active') THEN
   RETURN jsonb_build_object('ok',false,'error','already_closed'); END IF;
 RETURN jsonb_build_object('ok',false,'error','has_account');
END; $$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite(p_recipient text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.subscribers_invite(p_recipient);
$$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite_a(p_handle text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.subscribers_invite(p_handle);
$$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_accept(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tok uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth required'); END IF;
 SELECT token INTO tok FROM public.poll_subscriptions WHERE id=p_id AND subscriber_user_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not found or not pending'); END IF;
 RETURN public.poll_sub_accept(tok);
END; $$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_reject(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tok uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth required'); END IF;
 SELECT token INTO tok FROM public.poll_subscriptions WHERE id=p_id AND subscriber_user_id=auth.uid();
 IF NOT FOUND OR NOT public._subscriber_close(tok,false) THEN
 RETURN jsonb_build_object('ok',false,'error','not found or not pending/active'); END IF;
 RETURN jsonb_build_object('ok',true,'action','declined','id',p_id);
END; $$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_cancel(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tok uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth required'); END IF;
 SELECT token INTO tok FROM public.poll_subscriptions WHERE id=p_id AND subscriber_user_id=auth.uid();
 IF NOT FOUND OR NOT public._subscriber_close(tok,true) THEN
 RETURN jsonb_build_object('ok',false,'error','not found or not pending/active'); END IF;
 RETURN jsonb_build_object('ok',true,'action','declined','id',p_id);
END; $$;
CREATE OR REPLACE FUNCTION "public"."friend_invites_from_subscriptions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_created integer := 0;
  r         record;
  v_cd_ok   boolean;
  v_n       integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  v_email := public.poll_my_email();

  FOR r IN
    SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.subscriber_user_id = v_uid
        OR (v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(r.owner_id,v_uid)::text||':'||GREATEST(r.owner_id,v_uid)::text,329));
    PERFORM public._subscriber_pair_lock(r.owner_id,v_email);
    IF public._subscriber_refusal_until(r.owner_id,v_email) IS NOT NULL THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(r.owner_id, v_uid)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(r.owner_id, v_uid)
    ) THEN
      CONTINUE;
    END IF;

    SELECT c.ok INTO v_cd_ok
    FROM public.mail_cooldown_check('friend:invite_after_reject', 'pair:' || r.owner_id::text || ':' || v_uid::text) c;
    IF NOT v_cd_ok THEN
      CONTINUE;
    END IF;

    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (r.owner_id, v_uid, 'pending')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_created := v_created + v_n;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;
CREATE OR REPLACE FUNCTION "public"."friends_invite"("p_handle" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  PERFORM public._subscriber_pair_lock(v_uid,v_prof.email);
  v_cd_until:=public._subscriber_refusal_until(v_uid,v_prof.email);
  IF v_cd_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','after_reject');
  END IF;
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
CREATE OR REPLACE FUNCTION "public"."friends_accept"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  f public.friendships%rowtype; e text; deadline timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  SELECT * INTO f FROM public.friendships WHERE id=p_id AND addressee_id=v_uid AND status='pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,v_uid)::text||':'||GREATEST(f.requester_id,v_uid)::text,329));
  SELECT email INTO e FROM public.profiles WHERE id=v_uid;
  PERFORM public._subscriber_pair_lock(f.requester_id,e);
  deadline:=public._subscriber_refusal_until(f.requester_id,e);
  IF deadline IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',deadline,'reason','after_reject'); END IF;
  UPDATE public.friendships
     SET status = 'active', accepted_at = now(), declined_at = NULL
   WHERE id = p_id AND addressee_id = v_uid AND status='pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', 'accepted', 'id', p_id);
END;
$$;
COMMIT;
