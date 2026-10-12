-- E19: preserve direct invitations; pending friend invitations follow their source.
-- Historical provenance is unknown and stays direct; accepted access is independent.
BEGIN;
DO $$ BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   LOCK auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.profiles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.friendships IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.question_bases IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.question_base_shares IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.base_share_tasks IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_tasks IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.mail_cooldowns IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.1);
 END LOOP;
END $$;
ALTER TABLE public.base_share_tasks ADD COLUMN source_friendship_id uuid REFERENCES public.friendships(id) ON DELETE SET NULL;
ALTER TABLE public.base_share_tasks ADD COLUMN source_kind text NOT NULL DEFAULT 'base';
CREATE INDEX base_share_tasks_source_friendship_idx ON public.base_share_tasks(source_friendship_id);
ALTER TABLE public.base_share_tasks ADD CONSTRAINT base_task_source_kind CHECK
 ((source_kind='base' AND source_friendship_id IS NULL) OR (source_kind='friend' AND (source_friendship_id IS NOT NULL OR status='done' OR cancelled_at IS NOT NULL)));
CREATE OR REPLACE FUNCTION public._base_task_source_lock(t public.base_share_tasks)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[t.owner_id,t.recipient_user_id]);
 IF t.source_kind='base' OR t.status='done' THEN RETURN true; END IF;
 IF t.source_friendship_id IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(t.owner_id,t.recipient_user_id)::text||':'||GREATEST(t.owner_id,t.recipient_user_id)::text,329));
 PERFORM 1 FROM public.friendships f WHERE f.id=t.source_friendship_id AND f.status='active' AND f.cancelled_at IS NULL
 AND ((f.requester_id=t.owner_id AND f.addressee_id=t.recipient_user_id) OR (f.addressee_id=t.owner_id AND f.requester_id=t.recipient_user_id)) FOR SHARE;
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public._base_task_source_active(t public.base_share_tasks)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN t.status='done' THEN EXISTS(SELECT 1 FROM public.question_base_shares s WHERE s.base_id=t.base_id AND s.user_id=t.recipient_user_id)
 WHEN t.source_kind='base' THEN true ELSE EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=t.source_friendship_id
 AND f.status='active' AND f.cancelled_at IS NULL AND ((f.requester_id=t.owner_id AND f.addressee_id=t.recipient_user_id) OR (f.addressee_id=t.owner_id AND f.requester_id=t.recipient_user_id))) END;
$$;

CREATE OR REPLACE FUNCTION "public"."_base_share_create"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role", p_from_friend boolean, p_requested_email text DEFAULT NULL) RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
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
CREATE OR REPLACE FUNCTION "public"."base_share_by_user"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN
 RETURN QUERY SELECT * FROM public._base_share_create(p_base_id,p_recipient_user_id,p_role,false);
 END $$;
CREATE OR REPLACE FUNCTION "public"."base_share_to_friend"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN
 RETURN QUERY SELECT * FROM public._base_share_create(p_base_id,p_recipient_user_id,p_role,true);
 END $$;
CREATE OR REPLACE FUNCTION "public"."base_share_by_user"("p_base_id" "uuid", "p_user_lookup" "text", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_lookup text := lower(trim(p_user_lookup));
  v_recipient uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND public._poll_identity_regular(u.id,to_jsonb(u))) OR NOT EXISTS (
    SELECT 1 FROM public.question_bases qb WHERE qb.id = p_base_id AND qb.owner_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT pr.id INTO v_recipient FROM public.profiles pr JOIN auth.users u ON u.id=pr.id
  WHERE NOT pr.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u))
    AND ((position('@' in v_lookup)>0 AND public._poll_registered_uid(v_lookup)=pr.id)
      OR (position('@' in v_lookup)=0 AND lower(trim(pr.username))=v_lookup)) LIMIT 1;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public._base_share_create(p_base_id, v_recipient, p_role, false, CASE WHEN position('@' in v_lookup)>0 THEN v_lookup END);
END;
$$;
CREATE OR REPLACE FUNCTION "public"."base_share_accept"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); t public.base_share_tasks%rowtype;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND NOT is_guest) THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=uid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,uid);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
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
CREATE OR REPLACE FUNCTION "public"."base_share_decline"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT public._base_task_source_lock(v_t) THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(v_t.base_id,v_uid);
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
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
CREATE OR REPLACE FUNCTION "public"."base_share_cancel_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now()
 WHERE id=p_task_id AND owner_id=auth.uid() AND status IN ('pending','opened','declined');
 RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION "public"."base_share_resend"("p_task_id" "uuid") RETURNS "jsonb"
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
CREATE OR REPLACE FUNCTION "public"."base_share_update_invite_role"("p_task_id" "uuid", "p_role" "public"."base_share_role") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 IF p_role IS NULL THEN RETURN jsonb_build_object('ok',false,'err','invalid_role'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 UPDATE public.base_share_tasks SET role=p_role WHERE id=p_task_id AND owner_id=auth.uid()
 AND status IN ('pending','opened','declined') AND cancelled_at IS NULL
 AND coalesce(declined_at+interval '30 days',created_at+interval '5 days')>now();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 RETURN jsonb_build_object('ok',true,'role',p_role);
END; $$;
CREATE OR REPLACE FUNCTION "public"."base_share_undo_decline"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF NOT public._base_task_source_lock(v_t) THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(v_t.base_id,v_uid);
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF v_t.status<>'declined' OR v_t.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_declined'); END IF;
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF v_t.declined_at+interval '30 days'<=now() THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 UPDATE public.base_share_tasks SET status='pending' WHERE id=p_task_id;
 RETURN jsonb_build_object('ok',true,'id',p_task_id,'status','pending');
END; $$;
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
  JOIN public.question_bases b ON b.id=t.base_id AND b.owner_id=t.owner_id
  left join public.profiles op on op.id = t.owner_id
  where t.token::text=p_token AND public._base_task_source_active(t)
  and (t.status not in ('pending','opened','declined') OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now())
  limit 1;
$$;
CREATE OR REPLACE FUNCTION "public"."_friend_drop_pair_tasks"("p_a" "uuid", "p_b" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.poll_tasks pt
  WHERE pt.status IN ('pending', 'opened') AND pt.source_kind IN ('friend','game')
    AND ((pt.owner_id = p_a AND pt.recipient_user_id = p_b)
      OR (pt.owner_id = p_b AND pt.recipient_user_id = p_a));

  UPDATE public.base_share_tasks bt SET status=CASE WHEN bt.declined_at IS NOT NULL THEN 'declined' ELSE 'cancelled' END,cancelled_at=coalesce(bt.cancelled_at,now())
  WHERE bt.status IN('pending','opened','declined') AND bt.source_kind='friend'
  AND ((bt.owner_id=p_a AND bt.recipient_user_id=p_b) OR (bt.owner_id=p_b AND bt.recipient_user_id=p_a));

END;
$$;
CREATE OR REPLACE FUNCTION public._base_friend_source_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.base_share_tasks SET status=CASE WHEN declined_at IS NOT NULL THEN 'declined' ELSE 'cancelled' END,cancelled_at=coalesce(cancelled_at,now())
   WHERE source_friendship_id=OLD.id AND status IN('pending','opened','declined');
  RETURN OLD;
 END IF;
 IF NEW.status<>'active' OR NEW.cancelled_at IS NOT NULL THEN
  UPDATE public.base_share_tasks SET status=CASE WHEN declined_at IS NOT NULL THEN 'declined' ELSE 'cancelled' END,cancelled_at=coalesce(cancelled_at,now())
   WHERE source_friendship_id=NEW.id AND status IN('pending','opened','declined');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER base_friend_source_delete BEFORE DELETE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public._base_friend_source_close();
CREATE TRIGGER base_friend_source_close AFTER UPDATE OF status,cancelled_at ON public.friendships FOR EACH ROW EXECUTE FUNCTION public._base_friend_source_close();

REVOKE ALL ON FUNCTION public._base_share_create(uuid,uuid,public.base_share_role,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._base_task_source_lock(public.base_share_tasks) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._base_task_source_active(public.base_share_tasks) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._base_friend_source_close() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.base_share_to_friend(uuid,uuid,public.base_share_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_to_friend(uuid,uuid,public.base_share_role) TO authenticated;

COMMIT;
