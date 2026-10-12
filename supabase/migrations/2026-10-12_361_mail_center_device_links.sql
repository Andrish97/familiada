-- Mail center device actions use the same canonical Go route as invitations.
BEGIN;
-- Every list/action is scoped to a verified session, not a supplied email.
CREATE OR REPLACE FUNCTION public.mail_center_list(p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE scope jsonb; mailbox text; subs jsonb; tasks jsonb; devices jsonb;
BEGIN
 scope:=public._mail_center_scope(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 mailbox:=scope->>'email';
 IF scope->>'notifications_enabled' IS DISTINCT FROM 'true' THEN
  RETURN scope||jsonb_build_object('subscriptions','[]'::jsonb,'items','[]'::jsonb);
 END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) INTO subs FROM (
  SELECT s.id,s.created_at,jsonb_build_object('id',s.id,'kind','subscription','status',s.status,
   'owner_label',p.username,'created_at',s.created_at,'link','/go/?s='||s.token) item
  FROM public.poll_subscriptions s JOIN auth.users u ON u.id=s.owner_id
  LEFT JOIN public.profiles p ON p.id=s.owner_id
  WHERE public._norm_email(s.subscriber_email)=mailbox AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL
   AND s.status IN('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL
   AND public._poll_identity_regular(u.id,to_jsonb(u))
 ) rows;
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) INTO tasks FROM (
  SELECT t.id,t.created_at,jsonb_build_object('id',t.id,'kind','poll','status',t.status,
   'name',g.name,'owner_label',p.username,'created_at',t.created_at,'link','/go/?t='||t.token) item
  FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id JOIN auth.users u ON u.id=t.owner_id
  LEFT JOIN public.profiles p ON p.id=t.owner_id
  WHERE public._norm_email(t.recipient_email)=mailbox AND t.recipient_user_id IS NULL
   AND t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL AND t.done_at IS NULL
   AND g.status::text='poll_open' AND g.owner_id=t.owner_id AND g.type::text=t.poll_type AND g.share_key_poll=t.share_key_poll
   AND public._poll_task_source_active(t) AND public._poll_identity_regular(u.id,to_jsonb(u))
 ) rows;
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) INTO devices FROM (
  SELECT d.id,d.created_at,jsonb_build_object('id',d.id,'kind','device','status','available',
   'name',g.name,'device_type',d.device_type,'owner_label',p.username,'created_at',d.created_at,'link','/go/?d='||d.device_type||'&id='||d.game_id||'&key='||d.token) item
  FROM public.control_device_shares d JOIN public.control_runtime_sessions r ON r.id=d.session_id
  JOIN public.games g ON g.id=d.game_id JOIN auth.users u ON u.id=d.owner_id
  LEFT JOIN public.profiles p ON p.id=d.owner_id
  WHERE public._norm_email(d.recipient_email)=mailbox AND d.recipient_id IS NULL AND d.revoked_at IS NULL
   AND r.ended_at IS NULL AND r.expires_at>clock_timestamp() AND r.game_id=d.game_id AND r.owner_id=d.owner_id AND g.owner_id=d.owner_id
   AND public._poll_identity_regular(u.id,to_jsonb(u))
 ) rows;
 RETURN scope||jsonb_build_object('subscriptions',subs,'items',tasks||devices);
END $$;

CREATE OR REPLACE FUNCTION public.mail_center_action(p_secret text,p_kind text,p_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; scope jsonb; tok uuid; result jsonb; poll_result text;
BEGIN
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' OR p_id IS NULL
  OR p_kind IS NULL OR p_kind NOT IN('subscription','poll') OR p_action IS NULL
  OR (p_kind='subscription' AND p_action NOT IN('accept','decline'))
  OR (p_kind='poll' AND p_action<>'decline') THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 SELECT l.email INTO mailbox FROM public.mail_center_sessions s JOIN public.mail_center_links l ON l.id=s.link_id
 WHERE s.secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') AND s.revoked_at IS NULL AND l.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 scope:=public._mail_center_scope(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 IF scope->>'email' IS DISTINCT FROM mailbox THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF scope->>'notifications_enabled' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
 IF p_kind='subscription' THEN
  SELECT s.token INTO tok FROM public.poll_subscriptions s WHERE s.id=p_id
   AND public._norm_email(s.subscriber_email)=mailbox AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL
   AND s.cancelled_at IS NULL AND s.declined_at IS NULL AND s.status IN('pending','active');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','source_unavailable'); END IF;
  IF p_action='accept' THEN RETURN public.poll_sub_accept_email(tok,mailbox); END IF;
  IF public._subscriber_close(tok,true) THEN RETURN jsonb_build_object('ok',true); END IF;
 ELSE
  SELECT t.token INTO tok FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id WHERE t.id=p_id
   AND t.recipient_user_id IS NULL AND public._norm_email(t.recipient_email)=mailbox AND t.status IN('pending','opened')
   AND t.cancelled_at IS NULL AND t.declined_at IS NULL AND t.done_at IS NULL AND public._poll_task_source_active(t)
   AND g.status::text='poll_open' AND g.owner_id=t.owner_id AND g.type::text=t.poll_type AND g.share_key_poll=t.share_key_poll;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','source_unavailable'); END IF;
  poll_result:=public.poll_task_decline(tok);
  IF poll_result='ok' THEN RETURN jsonb_build_object('ok',true); END IF;
 END IF;
 RETURN jsonb_build_object('ok',false,'error','source_unavailable');
END $$;
REVOKE ALL ON FUNCTION public.mail_center_list(text),public.mail_center_action(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_list(text),public.mail_center_action(text,text,uuid,text) TO service_role;

COMMIT;
