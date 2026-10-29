-- Rodzic przed blokadami rekordów potomnych; sprzątanie pary dopiero po advisory lock.
BEGIN;
CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid,p_recipient_user_id uuid,p_role public.base_share_role)
RETURNS TABLE(ok boolean,err text,mail_to text,mail_link text,base_name text,owner_label text,cooldown_until timestamptz,recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); owner uuid; title text; label text; email text;
 target text; allowed boolean; deadline timestamptz; enabled boolean; t public.base_share_tasks%rowtype;
BEGIN
 IF uid IS NULL THEN RETURN QUERY SELECT false,'auth required',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 SELECT b.owner_id,b.name INTO owner,title FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR owner<>uid THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 IF p_recipient_user_id=uid THEN RETURN QUERY SELECT false,'owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 SELECT public._norm_email(p.email) INTO email FROM public.profiles p WHERE p.id=p_recipient_user_id AND NOT p.is_guest;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
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
 SELECT coalesce(nullif(p.username,''),p.email) INTO label FROM public.profiles p WHERE p.id=uid;
 INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,email_sent_at,email_send_count)
 VALUES(uid,p_base_id,p_recipient_user_id,email,p_role,'pending',CASE WHEN enabled THEN now() END,CASE WHEN enabled THEN 1 ELSE 0 END)
 RETURNING * INTO t;
 RETURN QUERY SELECT true,NULL::text,CASE WHEN enabled THEN email END,'/go/?b='||t.token,title,label,NULL::timestamptz,p_recipient_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.base_share_accept(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); t public.base_share_tasks%rowtype;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND NOT is_guest) THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=uid;
 IF NOT FOUND THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION public.leave_shared_base(p_base_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); v_owner_id uuid; v_share_role public.base_share_role;
 t public.base_share_tasks%rowtype; email text;
BEGIN
 IF uid IS NULL THEN RETURN false; END IF;
 SELECT b.owner_id INTO v_owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR v_owner_id=uid THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,uid);
 PERFORM 1 FROM public.question_bases b WHERE b.id=p_base_id AND b.owner_id=v_owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT role INTO v_share_role FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE base_id=p_base_id AND recipient_user_id=uid AND status='done'
 ORDER BY accepted_at DESC NULLS LAST,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR t.declined_at<=now()-interval '30 days' THEN
   IF FOUND THEN UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now() WHERE id=t.id; END IF;
   SELECT public._norm_email(p.email) INTO email FROM public.profiles p WHERE id=uid;
   INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,declined_at)
   VALUES(v_owner_id,p_base_id,uid,email,v_share_role,'declined',now());
   PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||v_owner_id||':'||uid||':base:'||p_base_id);
 ELSE
   UPDATE public.base_share_tasks SET status='declined',role=v_share_role,declined_at=coalesce(declined_at,now()) WHERE id=t.id;
   IF t.declined_at IS NULL THEN
     PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||v_owner_id||':'||uid||':base:'||p_base_id);
   END IF;
 END IF;
 DELETE FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=uid;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_base_share(p_base_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT b.owner_id INTO v_owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR v_owner_id<>auth.uid() THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_user_id);
 PERFORM 1 FROM public.question_bases b WHERE b.id=p_base_id AND b.owner_id=v_owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now()
 WHERE base_id=p_base_id AND recipient_user_id=p_user_id AND status IN ('pending','opened','done','declined');
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.base_share_decline(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION public.base_share_undo_decline(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
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

CREATE OR REPLACE FUNCTION public.base_share_resend(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.base_share_tasks%rowtype; b public.question_bases%rowtype;
 email text; label text; target text; allowed boolean; deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
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

CREATE OR REPLACE FUNCTION public.base_share_cancel_task(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
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
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 UPDATE public.base_share_tasks SET role=p_role WHERE id=p_task_id AND owner_id=auth.uid()
 AND status IN ('pending','opened','declined') AND cancelled_at IS NULL
 AND coalesce(declined_at+interval '30 days',created_at+interval '5 days')>now();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 RETURN jsonb_build_object('ok',true,'role',p_role);
END; $$;

CREATE OR REPLACE FUNCTION public.update_base_share_role(p_base_id uuid,p_user_id uuid,p_role public.base_share_role)
RETURNS TABLE(ok boolean,err text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN QUERY SELECT false,'auth required'; RETURN; END IF;
 SELECT b.owner_id INTO v_owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'base_not_found'; RETURN; END IF;
 IF v_owner_id<>auth.uid() THEN RETURN QUERY SELECT false,'not_owner'; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role'; RETURN; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_user_id);
 PERFORM 1 FROM public.question_bases b WHERE b.id=p_base_id AND b.owner_id=v_owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'base_not_found'; RETURN; END IF;
 UPDATE public.question_base_shares SET role=p_role WHERE base_id=p_base_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'share_not_found'; RETURN; END IF;
 RETURN QUERY SELECT true,NULL::text;
END; $$;
COMMIT;
