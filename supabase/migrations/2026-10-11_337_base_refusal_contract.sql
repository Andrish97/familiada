BEGIN;
CREATE OR REPLACE FUNCTION public._base_share_pair_lock(p_base uuid,p_recipient uuid)
RETURNS void LANGUAGE sql SET search_path=public,pg_temp AS $$
 SELECT pg_advisory_xact_lock(hashtextextended(p_base::text||':'||p_recipient::text,337));
$$;
REVOKE ALL ON FUNCTION public._base_share_pair_lock(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public._base_share_refusal_until(p_base uuid,p_recipient uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT greatest(max(t.declined_at)+interval '30 days',
  (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c JOIN public.question_bases b ON b.id=p_base
   WHERE c.action_key='base:share_after_reject' AND c.next_allowed_at>now()
   AND c.target_key='pair:'||b.owner_id||':'||p_recipient||':base:'||p_base))
 FROM public.base_share_tasks t WHERE t.base_id=p_base AND t.recipient_user_id=p_recipient
 AND t.declined_at>now()-interval '30 days';
$$;
REVOKE ALL ON FUNCTION public._base_share_refusal_until(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.leave_shared_base(p_base_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); owner_id uuid; v_share_role public.base_share_role;
 t public.base_share_tasks%rowtype; email text;
BEGIN
 IF uid IS NULL THEN RETURN false; END IF;
 SELECT b.owner_id INTO owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR owner_id=uid THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,uid);
 SELECT role INTO v_share_role FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE base_id=p_base_id AND recipient_user_id=uid AND status='done'
 ORDER BY accepted_at DESC NULLS LAST,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR t.declined_at<=now()-interval '30 days' THEN
   IF FOUND THEN UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now() WHERE id=t.id; END IF;
   SELECT public._norm_email(p.email) INTO email FROM public.profiles p WHERE id=uid;
   INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,declined_at)
   VALUES(owner_id,p_base_id,uid,email,v_share_role,'declined',now());
   PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||owner_id||':'||uid||':base:'||p_base_id);
 ELSE
   UPDATE public.base_share_tasks SET status='declined',role=v_share_role,declined_at=coalesce(declined_at,now()) WHERE id=t.id;
   IF t.declined_at IS NULL THEN
     PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||owner_id||':'||uid||':base:'||p_base_id);
   END IF;
 END IF;
 DELETE FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=uid;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.leave_shared_base(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.leave_shared_base(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_base_share_role(p_base_id uuid,p_user_id uuid,p_role public.base_share_role)
RETURNS TABLE(ok boolean,err text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN QUERY SELECT false,'auth required'; RETURN; END IF;
 SELECT b.owner_id INTO owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'base_not_found'; RETURN; END IF;
 IF owner_id<>auth.uid() THEN RETURN QUERY SELECT false,'not_owner'; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role'; RETURN; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_user_id);
 UPDATE public.question_base_shares SET role=p_role WHERE base_id=p_base_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'share_not_found'; RETURN; END IF;
 RETURN QUERY SELECT true,NULL::text;
END; $$;
REVOKE ALL ON FUNCTION public.update_base_share_role(uuid,uuid,public.base_share_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_base_share_role(uuid,uuid,public.base_share_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_base_share(p_base_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT b.owner_id INTO owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR owner_id<>auth.uid() THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_user_id);
 DELETE FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now()
 WHERE base_id=p_base_id AND recipient_user_id=p_user_id AND status IN ('pending','opened','done','declined');
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.revoke_base_share(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_base_share(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.base_share_resend(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.base_share_tasks%rowtype; b public.question_bases%rowtype;
 email text; label text; target text; allowed boolean; deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR t.status NOT IN ('pending','opened') OR t.cancelled_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','not_pending'); END IF;
 SELECT * INTO b FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id;
 IF NOT FOUND OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')<=now() THEN
   RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 SELECT public._norm_email(p.email) INTO email FROM public.profiles p WHERE id=t.recipient_user_id AND NOT is_guest;
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
REVOKE ALL ON FUNCTION public.base_share_resend(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_resend(uuid) TO authenticated;

INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('base:share_after_reject','pair',2592000,true) ON CONFLICT(action_key) DO UPDATE SET scope=excluded.scope,cooldown_seconds=excluded.cooldown_seconds,enforce=excluded.enforce;
CREATE OR REPLACE FUNCTION public.base_share_tasks_cleanup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DELETE FROM public.base_share_tasks
 WHERE status IN ('pending','opened','declined')
   AND CASE WHEN declined_at IS NOT NULL THEN declined_at+interval '30 days'
            ELSE created_at+interval '5 days' END<=now();
$$;

CREATE OR REPLACE FUNCTION public.base_share_decline(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(v_t.base_id,v_uid);
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_t.status NOT IN ('pending','opened') OR v_t.cancelled_at IS NOT NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF coalesce(v_t.declined_at+interval '30 days',v_t.created_at+interval '5 days')<=now() THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='declined',declined_at=coalesce(declined_at,now()) WHERE id=p_task_id;
 IF v_t.declined_at IS NULL THEN
  PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||v_t.owner_id||':'||v_uid||':base:'||v_t.base_id);
 END IF;
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION public.base_share_undo_decline(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(v_t.base_id,v_uid);
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF v_t.status<>'declined' OR v_t.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_declined'); END IF;
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF v_t.declined_at+interval '30 days'<=now() THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 UPDATE public.base_share_tasks SET status='pending' WHERE id=p_task_id;
 RETURN jsonb_build_object('ok',true,'id',p_task_id,'status','pending');
END; $$;
CREATE OR REPLACE FUNCTION public.base_declines_list_mine()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'base_id',b.id,'name',b.name,
  'owner_label',coalesce(nullif(p.username,''),p.email),'role',t.role,'token',t.token,
  'declined_at',t.declined_at,'expires_at',t.declined_at+interval '30 days') ORDER BY t.declined_at DESC),'[]'::jsonb)
 FROM public.base_share_tasks t JOIN public.question_bases b ON b.id=t.base_id
 JOIN public.profiles p ON p.id=t.owner_id
 WHERE t.recipient_user_id=auth.uid() AND b.owner_id=t.owner_id AND t.cancelled_at IS NULL AND t.status='declined' AND t.declined_at>now()-interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.base_share_undo_decline(uuid),public.base_declines_list_mine() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_undo_decline(uuid),public.base_declines_list_mine() TO authenticated;


CREATE OR REPLACE FUNCTION "public"."list_base_share_tasks_outgoing"("p_base_id" "uuid") RETURNS TABLE("task_id" "uuid", "recipient_user_id" "uuid", "recipient_email" "text", "recipient_username" "text", "role" "public"."base_share_role", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path=public,pg_temp
    AS $$
declare
  v_owner uuid;
begin
  perform public.base_share_tasks_cleanup();

  select qb.owner_id
    into v_owner
  from public.question_bases qb
  where qb.id = p_base_id;

  if auth.uid() is null or v_owner is null or v_owner <> auth.uid() then
    return;
  end if;

  return query
  select
    t.id as task_id,
    t.recipient_user_id,
    t.recipient_email,
    pr.username as recipient_username,
    t.role,
    t.status,
    t.created_at
  from public.base_share_tasks t
  left join public.profiles pr on pr.id = t.recipient_user_id
  where t.base_id = p_base_id
    and t.owner_id = auth.uid()
    and (t.status in ('pending','opened') OR (t.status='declined' AND t.declined_at>now()-interval '5 days'))
  order by t.created_at desc;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."base_share_token_info"("p_token" "text") RETURNS TABLE("status" "text", "base_id" "uuid", "recipient_user_id" "uuid", "recipient_email" "text", "owner_id" "uuid", "owner_email" "text", "owner_username" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.status,
    t.base_id,
    t.recipient_user_id,
    t.recipient_email,
    t.owner_id,
    op.email as owner_email,
    op.username as owner_username
  from public.base_share_tasks t
  left join public.profiles op on op.id = t.owner_id
  where t.token::text=p_token
  and (t.status not in ('pending','opened','declined') OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now())
  limit 1;
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
REVOKE ALL ON FUNCTION public.base_share_tasks_cleanup() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.base_share_decline(uuid),public.base_share_accept(uuid),public.base_share_cancel_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_decline(uuid),public.base_share_accept(uuid),public.base_share_cancel_task(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid,p_recipient_user_id uuid,p_role public.base_share_role)
RETURNS TABLE(ok boolean,err text,mail_to text,mail_link text,base_name text,owner_label text,cooldown_until timestamptz,recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); owner uuid; title text; label text; email text;
 target text; allowed boolean; deadline timestamptz; enabled boolean; t public.base_share_tasks%rowtype;
BEGIN
 IF uid IS NULL THEN RETURN QUERY SELECT false,'auth required',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 PERFORM public.base_share_tasks_cleanup();
 SELECT b.owner_id,b.name INTO owner,title FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR owner<>uid THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 IF p_recipient_user_id=uid THEN RETURN QUERY SELECT false,'owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 SELECT public._norm_email(p.email) INTO email FROM public.profiles p WHERE p.id=p_recipient_user_id AND NOT p.is_guest;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_recipient_user_id);
 SELECT b.name INTO title FROM public.question_bases b WHERE id=p_base_id AND b.owner_id=uid FOR KEY SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
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
 SELECT coalesce(nullif(p.username,''),p.email) INTO label FROM public.profiles p WHERE p.id=uid;
 INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,email_sent_at,email_send_count)
 VALUES(uid,p_base_id,p_recipient_user_id,email,p_role,'pending',CASE WHEN enabled THEN now() END,CASE WHEN enabled THEN 1 ELSE 0 END)
 RETURNING * INTO t;
 RETURN QUERY SELECT true,NULL::text,CASE WHEN enabled THEN email END,'/go/?b='||t.token,title,label,NULL::timestamptz,p_recipient_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.base_share_by_email(p_base_id uuid,p_email text,p_role public.base_share_role)
RETURNS TABLE(ok boolean,err text,mail_to text,mail_link text,base_name text,owner_label text,cooldown_until timestamptz,recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN QUERY SELECT false,'auth required',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 SELECT id INTO recipient FROM public.profiles WHERE public._norm_email(email)=public._norm_email(p_email) AND NOT is_guest LIMIT 1;
 RETURN QUERY SELECT * FROM public.base_share_by_user(p_base_id,recipient,p_role);
END; $$;

CREATE OR REPLACE FUNCTION public.base_share_accept(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); t public.base_share_tasks%rowtype;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND NOT is_guest) THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=uid;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,uid);
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=uid FOR UPDATE;
 IF NOT FOUND OR t.recipient_user_id IS DISTINCT FROM uid OR t.status NOT IN ('pending','opened') OR t.cancelled_at IS NOT NULL
 OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')<=now() THEN RETURN false; END IF;
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.question_base_shares(base_id,user_id,role) VALUES(t.base_id,uid,t.role)
 ON CONFLICT(base_id,user_id) DO UPDATE SET role=excluded.role;
 UPDATE public.base_share_tasks SET status='done',accepted_at=coalesce(accepted_at,now()) WHERE id=t.id;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.base_share_cancel_task(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now()
 WHERE id=p_task_id AND owner_id=auth.uid() AND status IN ('pending','opened','declined');
 RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.base_share_update_invite_role(p_task_id uuid,p_role public.base_share_role)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 IF p_role IS NULL THEN RETURN jsonb_build_object('ok',false,'err','invalid_role'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 UPDATE public.base_share_tasks SET role=p_role WHERE id=p_task_id AND owner_id=auth.uid()
 AND status IN ('pending','opened','declined') AND cancelled_at IS NULL
 AND coalesce(declined_at+interval '30 days',created_at+interval '5 days')>now();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 RETURN jsonb_build_object('ok',true,'role',p_role);
END; $$;
REVOKE ALL ON FUNCTION public.base_share_by_user(uuid,uuid,public.base_share_role),public.base_share_by_email(uuid,text,public.base_share_role),
 public.base_share_update_invite_role(uuid,public.base_share_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_by_user(uuid,uuid,public.base_share_role),public.base_share_by_email(uuid,text,public.base_share_role),
 public.base_share_update_invite_role(uuid,public.base_share_role) TO authenticated;

-- Jedno źródło danych wspólnego okna; dostępne znajomości bez aktywnego/pending dostępu.
CREATE OR REPLACE FUNCTION public.base_share_panel(p_base_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); b public.question_bases%rowtype; friends jsonb; outgoing jsonb; active jsonb;
BEGIN
 SELECT * INTO b FROM public.question_bases WHERE id=p_base_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'cooldown_until',greatest(public._base_share_refusal_until(p_base_id,f.user_id),
   (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE c.action_key='base:share' AND c.next_allowed_at>now()
    AND c.target_key='pair:'||uid||':'||f.user_id||':base:'||p_base_id)),
  'email_enabled',public._contact_mail_enabled(f.email)) ORDER BY f.label),'[]'::jsonb) INTO friends
 FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend'
 AND NOT EXISTS(SELECT 1 FROM public.question_base_shares s WHERE s.base_id=p_base_id AND s.user_id=f.user_id)
 AND NOT EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.base_id=p_base_id AND t.recipient_user_id=f.user_id
  AND t.status IN ('pending','opened') AND t.cancelled_at IS NULL
  AND coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now());
 SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',t.id,'recipient_user_id',t.recipient_user_id,
  'label',coalesce(nullif(p.username,''),t.recipient_email),'email',t.recipient_email,'role',t.role,'status',t.status,
  'is_friend',public.are_friends(uid,t.recipient_user_id),'email_enabled',public._contact_mail_enabled(p.email),
  'declined_at',t.declined_at,'expires_at',coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days'),
  'cooldown_until',CASE WHEN t.status='declined' THEN public._base_share_refusal_until(p_base_id,t.recipient_user_id)
    ELSE (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE c.action_key='base:share' AND c.next_allowed_at>now()
     AND c.target_key='pair:'||uid||':'||t.recipient_user_id||':base:'||p_base_id) END)
 ORDER BY t.created_at DESC),'[]'::jsonb) INTO outgoing
 FROM public.base_share_tasks t JOIN public.profiles p ON p.id=t.recipient_user_id
 WHERE t.base_id=p_base_id AND t.owner_id=uid AND t.cancelled_at IS NULL
 AND ((t.status IN ('pending','opened') AND coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now())
 OR (t.status='declined' AND t.declined_at>now()-interval '5 days'));
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'label',coalesce(nullif(p.username,''),p.email),
  'email',p.email,'role',s.role,'status','done','is_friend',public.are_friends(uid,s.user_id)) ORDER BY p.username),'[]'::jsonb) INTO active
 FROM public.question_base_shares s JOIN public.profiles p ON p.id=s.user_id WHERE s.base_id=p_base_id;
 RETURN jsonb_build_object('ok',true,'friends',friends,'outgoing',outgoing,'active',active);
END; $$;
REVOKE ALL ON FUNCTION public.base_share_panel(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_panel(uuid) TO authenticated;

-- Nieużywane wejście sprzed zaproszeń udzielało dostępu bez zgody odbiorcy.
-- Brak wywołań w aplikacji; zamknięcie uprawnień zamiast aliasu/fallbacku.
REVOKE ALL ON FUNCTION public.share_base_by_email(uuid,text,public.base_share_role) FROM PUBLIC,anon,authenticated;
-- Odczyt zachowuje qb_shares_select; zapis tylko przez RPC cyklu zaproszenia.
DROP POLICY IF EXISTS qb_shares_write ON public.question_base_shares;
REVOKE ALL ON FUNCTION public.base_share_accept(uuid),public.base_share_decline(uuid),public.base_share_cancel_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_accept(uuid),public.base_share_decline(uuid),public.base_share_cancel_task(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_tasks_cleanup() FROM PUBLIC,anon,authenticated;
COMMIT;
