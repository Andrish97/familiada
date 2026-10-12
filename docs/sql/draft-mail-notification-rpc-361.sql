-- LOCAL DRAFT: preserve original behavior and budgets, add one private queue allocation.
-- Private implementations are not callable by clients; public RPC OIDs stay unchanged.

CREATE OR REPLACE FUNCTION "public"."_mail_original361_friends_invite"("p_handle" "text") RETURNS "jsonb"
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
  v_auth_email text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_id       uuid;
  v_token    uuid;
  v_enabled boolean; v_prev_count integer:=0; v_prev_sent timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty handle');
  END IF;

  SELECT p.* INTO v_prof
  FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE ((v_is_email AND p.id=public._poll_registered_uid(v_h))
      OR (NOT v_is_email AND lower(p.username)=lower(v_h)))
    AND NOT p.is_guest AND public._norm_email(u.email) IS NOT NULL
    AND public._poll_identity_regular(u.id,to_jsonb(u));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'unknown_user', 'has_email_only', v_is_email);
  END IF;

  IF v_prof.id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'err', 'self');
  END IF;

  SELECT public._norm_email(email) INTO v_prof.email FROM auth.users WHERE id=v_prof.id;
  PERFORM public._poll_identity_email_refs(ARRAY[v_prof.email],ARRAY[v_uid,v_prof.id]);
  SELECT public._norm_email(email) INTO v_auth_email FROM auth.users WHERE id=v_prof.id;
  IF v_auth_email IS DISTINCT FROM v_prof.email OR
     (v_is_email AND public._poll_registered_uid(v_h) IS DISTINCT FROM v_prof.id) THEN
    RETURN jsonb_build_object('ok',false,'err','unknown_user','has_email_only',v_is_email);
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

  -- Both directions refer to the same relationship and refusal.
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.cancelled_at IS NULL AND (v_ex.status<>'declined' OR v_ex.declined_at>now()-interval '30 days') THEN
      RETURN jsonb_build_object('ok',false,'err','already','id',v_ex.id,
        'status',v_ex.status,'direction',CASE WHEN v_ex.status='active' THEN 'friend'
          WHEN v_ex.decision_user_id=v_uid THEN 'incoming' ELSE 'outgoing' END);
    END IF;
    IF v_ex.declined_at>now()-interval '30 days' THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_ex.declined_at+interval '30 days','reason','after_reject');
    END IF;
    IF v_ex.email_sent_at>now()-interval '30 days' THEN
      v_prev_count:=v_ex.email_send_count; v_prev_sent:=v_ex.email_sent_at;
    END IF;
  END IF;
  v_target := 'pair:' || v_uid::text || ':' || v_prof.id::text;
  SELECT max(next_allowed_at) INTO v_cd_until FROM public.mail_cooldowns
   WHERE action_key='friend:invite_after_reject' AND next_allowed_at>now()
   AND target_key IN (v_target,'pair:'||v_prof.id||':'||v_uid);
  IF v_cd_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','after_reject');
  END IF;
  v_enabled:=public._contact_mail_enabled(v_prof.email);
  IF v_enabled THEN
    v_cd_until:=public._friend_mail_limit_until(v_uid,v_prof.id);
    IF v_cd_until>now() THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','mail_limit');
    END IF;
    SELECT greatest(max(next_allowed_at),v_prev_sent+interval '5 days') INTO v_cd_until
     FROM public.mail_cooldowns WHERE action_key IN ('friend:invite','friend:resend')
     AND target_key IN (v_target,'pair:'||v_prof.id||':'||v_uid);
    IF v_cd_until>now() THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','invite');
    END IF;
  END IF;
  -- Delete only after all checks; copy the still-valid budget to the new token.
  IF v_ex.id IS NOT NULL THEN DELETE FROM public.friendships WHERE id=v_ex.id; END IF;
  BEGIN
    INSERT INTO public.friendships(requester_id,addressee_id,status,email_sent_at,email_send_count)
    VALUES(v_uid,v_prof.id,'pending',CASE WHEN v_enabled THEN now() ELSE v_prev_sent END,
      v_prev_count+CASE WHEN v_enabled THEN 1 ELSE 0 END)
    RETURNING id,token INTO v_id,v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok',false,'err','already');
  END;
  IF v_enabled THEN PERFORM public.mail_cooldown_reserve('friend:invite',v_target); END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'to', v_prof.email, 'mail_allowed', v_enabled,
                            'accepted', false, 'status', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public._mail_original361_friends_invite(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.friends_invite(p_handle text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_invite(p_handle);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' AND result->>'id' IS NOT NULL THEN PERFORM public._mail_allocate_notification_prototype('friend',(result->>'id')::uuid,'friend:invite'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."_mail_original361_friends_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  v_f:=public._friend_locked(p_id);
  IF v_f.id IS NULL OR v_f.decision_user_id=v_uid OR v_f.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  IF v_f.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'err',CASE WHEN v_f.status='declined' THEN 'declined' ELSE 'not_pending' END);
  END IF;

  SELECT public._norm_email(u.email) INTO v_to FROM auth.users u WHERE u.id=v_f.decision_user_id;
  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok', true, 'mail_allowed', false);
  END IF;

  IF v_f.email_sent_at>now()-interval '5 days' THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_f.email_sent_at+interval '5 days');
  END IF;
  v_lim := public._friend_mail_limit_until(v_uid, v_f.decision_user_id);
  IF v_lim IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_f.decision_user_id::text;
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

  SELECT public._norm_email(u.email) INTO v_to FROM auth.users u WHERE u.id=v_f.decision_user_id;
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
REVOKE ALL ON FUNCTION public._mail_original361_friends_resend(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.friends_resend(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_resend(p_id);
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification_prototype('friend',p_id,'friend:resend'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."_mail_original361_polls_hub_subscriber_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); s public.poll_subscriptions%rowtype;
 v_to text; v_target text; v_ok boolean; v_until timestamptz; v_unsub uuid;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[s.subscriber_email],ARRAY[v_uid,s.subscriber_user_id,s.registered_user_id]);
 v_to:=public._norm_email(s.subscriber_email);
 IF v_to IS NULL AND s.subscriber_user_id IS NOT NULL THEN
   SELECT public._norm_email(email) INTO v_to FROM auth.users WHERE id=s.subscriber_user_id;
 END IF;
 IF v_to IS NULL THEN RETURN jsonb_build_object('ok',false,'err','no email for this subscriber'); END IF;
 -- Serialize the budget across separate historical rows for this same pair.
 PERFORM public._subscriber_pair_lock(v_uid,v_to);
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 IF s.status<>'pending' OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','only pending can be resent');
 END IF;
 IF s.registered_user_id IS NOT NULL OR s.subscriber_user_id IS NOT NULL OR public._poll_registered_uid(v_to) IS NOT NULL THEN
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
REVOKE ALL ON FUNCTION public._mail_original361_polls_hub_subscriber_resend(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_resend(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_polls_hub_subscriber_resend(p_id);
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification_prototype('subscription',p_id,'poll:resend'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."_mail_original361_base_share_resend"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.base_share_tasks%rowtype; b public.question_bases%rowtype;
 email text; label text; target text; allowed boolean; deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR t.status NOT IN ('pending','opened') OR t.cancelled_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','not_pending'); END IF;
 SELECT * INTO b FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id;
 IF NOT FOUND OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')<=now() THEN
   RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 SELECT public._norm_email(u.email) INTO email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=t.recipient_user_id AND NOT p.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','unknown_user'); END IF;
 IF NOT public._contact_mail_enabled(email) THEN RETURN jsonb_build_object('ok',true,'mail_allowed',false); END IF;
 target:='pair:'||t.owner_id||':'||t.recipient_user_id||':base:'||t.base_id;
 SELECT ok,next_allowed_at INTO allowed,deadline FROM public.mail_cooldown_reserve('base:share',target);
 IF NOT allowed THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',deadline); END IF;
 UPDATE public.base_share_tasks SET email_sent_at=now(),email_send_count=email_send_count+1 WHERE id=t.id;
 SELECT coalesce(nullif(p.username,''),p.email) INTO label FROM public.profiles p WHERE id=t.owner_id;
 RETURN jsonb_build_object('ok',true,'mail_allowed',true,'mail_to',email,'mail_link','/go/?b='||t.token,
   'base_name',b.name,'owner_label',label,'recipient_id',t.recipient_user_id,'base_id',t.base_id);
END; $$;
REVOKE ALL ON FUNCTION public._mail_original361_base_share_resend(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.base_share_resend(p_task_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_base_share_resend(p_task_id);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification_prototype('base',p_task_id,'base:share'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION "public"."_mail_original361_poll_share_send"("p_game_id" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "jsonb"
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
REVOKE ALL ON FUNCTION public._mail_original361_poll_share_send(uuid,uuid[],uuid[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.poll_share_send(p_game_id uuid,p_friend_ids uuid[],p_subscriber_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb; item jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_poll_share_send(p_game_id,p_friend_ids,p_subscriber_ids);
 IF result->>'ok'='true' THEN FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP PERFORM public._mail_allocate_notification_prototype('poll',(item->>'task_id')::uuid,'poll:share'); END LOOP; END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."_mail_original361_poll_share_remind"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  g record;
  t public.poll_tasks%rowtype;
  v_to text;
  v_target text;
  v_ok boolean;
  v_until timestamptz;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  SELECT * INTO t FROM public.poll_tasks WHERE id=p_task_id AND game_id=p_game_id AND owner_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  PERFORM public._poll_identity_email_refs(ARRAY[t.recipient_email],ARRAY[v_uid,t.recipient_user_id]);
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT id, name, status::text AS status, share_key_poll INTO g
  FROM public.games WHERE id = p_game_id FOR UPDATE;

  IF g.status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  SELECT * INTO t FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;
  IF t.status NOT IN ('pending', 'opened') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task not pending');
  END IF;
  IF t.share_key_poll IS DISTINCT FROM g.share_key_poll THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task expired');
  END IF;

  IF NOT public._poll_task_source_active(t) THEN RETURN jsonb_build_object('ok',false,'err','task expired'); END IF;
  v_to:=public._norm_email(coalesce(t.recipient_email,(SELECT u.email FROM auth.users u WHERE u.id=t.recipient_user_id)));
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this recipient');
  END IF;

  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok',true,'mail_allowed',false,'mail','[]'::jsonb);
  END IF;
  IF t.reminder_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'err', 'reminder limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(t.recipient_user_id::text, 'email:' || md5(lower(coalesce(t.recipient_email, '')))) ||
    ':game:' || p_game_id::text;

  SELECT c.ok, c.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_check('poll:share', v_target) c;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  v_until := public._poll_daily_cap_until(v_uid, v_to);
  IF v_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until, 'reason', 'daily_cap');
  END IF;

  SELECT r.ok, r.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_reserve('poll:share', v_target) r;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  UPDATE public.poll_tasks SET reminder_count = reminder_count + 1 WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text,
    'game_name', g.name, 'poll_type', t.poll_type,
    'reminder_count', t.reminder_count + 1,
    'mail', jsonb_build_array(jsonb_build_object(
      'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text))
  );
END $$;
REVOKE ALL ON FUNCTION public._mail_original361_poll_share_remind(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.poll_share_remind(p_game_id uuid,p_task_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb; item jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_poll_share_remind(p_game_id,p_task_id);
 IF result->>'ok'='true' THEN FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP PERFORM public._mail_allocate_notification_prototype('poll',(item->>'task_id')::uuid,'poll:share'); END LOOP; END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."_mail_original361_control_device_share_create"("p_game_id" "uuid", "p_device_type" "text", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
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
REVOKE ALL ON FUNCTION public._mail_original361_control_device_share_create(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.control_device_share_create(p_game_id uuid,p_device_type text,p_recipient_user_id uuid DEFAULT NULL,p_recipient_email text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE result jsonb; item jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_control_device_share_create(p_game_id,p_device_type,p_recipient_user_id,p_recipient_email);
 IF result->>'ok'='true' THEN IF result->>'created'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification_prototype('device',(result->>'share_id')::uuid,'device:share'); END IF; END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."_mail_original361_base_share_create"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role", "p_from_friend" boolean, "p_requested_email" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); owner uuid; title text; label text; email text;
 target text; allowed boolean; deadline timestamptz; enabled boolean; t public.base_share_tasks%rowtype; source_friend uuid;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN QUERY SELECT false,'auth required',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 SELECT b.owner_id,b.name INTO owner,title FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR owner<>uid THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 IF p_recipient_user_id=uid THEN RETURN QUERY SELECT false,'owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 SELECT public._norm_email(u.email) INTO email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=p_recipient_user_id AND NOT p.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF NOT FOUND THEN RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[email],ARRAY[uid,p_recipient_user_id]);
 SELECT public._norm_email(u.email) INTO email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=p_recipient_user_id AND NOT p.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF NOT FOUND THEN RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 PERFORM public._poll_identity_mail_locks(ARRAY[email]);
 IF p_requested_email IS NOT NULL AND public._poll_registered_uid(p_requested_email) IS DISTINCT FROM p_recipient_user_id THEN
  RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN;
 END IF;
 IF p_from_friend THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(uid,p_recipient_user_id)::text||':'||GREATEST(uid,p_recipient_user_id)::text,329));
  SELECT f.id INTO source_friend FROM public.friendships f WHERE f.status='active' AND f.cancelled_at IS NULL
   AND ((f.requester_id=uid AND f.addressee_id=p_recipient_user_id) OR (f.addressee_id=uid AND f.requester_id=p_recipient_user_id)) FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'not_friend',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_recipient_user_id);
 SELECT b.name INTO title FROM public.question_bases b WHERE id=p_base_id AND b.owner_id=uid FOR KEY SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 DELETE FROM public.base_share_tasks bt WHERE bt.base_id=p_base_id AND bt.recipient_user_id=p_recipient_user_id
 AND bt.status IN ('pending','opened','declined')
 AND coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')<=now();
 IF EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=p_recipient_user_id) THEN
   RETURN QUERY SELECT false,'already_active',NULL::text,NULL::text,title,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.base_share_tasks bt WHERE bt.base_id=p_base_id AND bt.owner_id=uid AND bt.recipient_user_id=p_recipient_user_id
 AND bt.status IN ('pending','opened') AND bt.cancelled_at IS NULL
 AND coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')>now()) THEN
   RETURN QUERY SELECT false,'already_pending',NULL::text,NULL::text,title,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 deadline:=public._base_share_refusal_until(p_base_id,p_recipient_user_id);
 IF deadline IS NOT NULL THEN RETURN QUERY SELECT false,'declined',NULL::text,NULL::text,title,NULL::text,deadline,p_recipient_user_id; RETURN; END IF;
 enabled:=public._contact_mail_enabled(email);
 target:='pair:'||uid||':'||p_recipient_user_id||':base:'||p_base_id;
 IF enabled THEN
   SELECT c.ok,c.next_allowed_at INTO allowed,deadline FROM public.mail_cooldown_reserve('base:share',target) c;
   IF NOT allowed THEN RETURN QUERY SELECT false,'cooldown',NULL::text,NULL::text,title,NULL::text,deadline,p_recipient_user_id; RETURN; END IF;
 END IF;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=uid;
 INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,email_sent_at,email_send_count,source_kind,source_friendship_id)
 VALUES(uid,p_base_id,p_recipient_user_id,email,p_role,'pending',CASE WHEN enabled THEN now() END,CASE WHEN enabled THEN 1 ELSE 0 END,CASE WHEN p_from_friend THEN 'friend' ELSE 'base' END,source_friend)
 RETURNING * INTO t;
 RETURN QUERY SELECT true,NULL::text,CASE WHEN enabled THEN email END,'/go/?b='||t.token,title,label,NULL::timestamptz,p_recipient_user_id;
END; $$;
REVOKE ALL ON FUNCTION public._mail_original361_base_share_create(uuid,uuid,public.base_share_role,boolean,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._base_share_create(p_base_id uuid,p_recipient_user_id uuid,p_role public.base_share_role,p_from_friend boolean,p_requested_email text DEFAULT NULL)
RETURNS TABLE(ok boolean,err text,mail_to text,mail_link text,base_name text,owner_label text,cooldown_until timestamptz,recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE row_result record; source_id uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 FOR row_result IN SELECT * FROM public._mail_original361_base_share_create(p_base_id,p_recipient_user_id,p_role,p_from_friend,p_requested_email) LOOP
  IF row_result.ok AND row_result.mail_to IS NOT NULL AND row_result.mail_link IS NOT NULL THEN
   SELECT id INTO source_id FROM public.base_share_tasks WHERE owner_id=auth.uid() AND base_id=p_base_id AND recipient_user_id=row_result.recipient_id
    AND token::text=substring(row_result.mail_link FROM '[?]b=([a-f0-9-]{36})');
   PERFORM public._mail_allocate_notification_prototype('base',source_id,'base:share');
  END IF;
  RETURN QUERY SELECT row_result.ok,row_result.err,row_result.mail_to,row_result.mail_link,row_result.base_name,row_result.owner_label,row_result.cooldown_until,row_result.recipient_id;
 END LOOP;
 RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
