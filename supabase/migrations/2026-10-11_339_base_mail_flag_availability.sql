-- Dostępność listy odpowiada RPC: flaga wyłącza tylko mailowy cooldown, nie odmowę.
BEGIN;
CREATE OR REPLACE FUNCTION public.base_share_panel(p_base_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); b public.question_bases%rowtype; friends jsonb; outgoing jsonb; active jsonb;
BEGIN
 SELECT * INTO b FROM public.question_bases WHERE id=p_base_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'cooldown_until',greatest(public._base_share_refusal_until(p_base_id,f.user_id),
   (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE public._contact_mail_enabled(f.email) AND c.action_key='base:share' AND c.next_allowed_at>now()
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
COMMIT;
