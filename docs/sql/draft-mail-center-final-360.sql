-- E19: private mail center and notification source lifecycle.
-- Auth email stays direct and independent of every notification flag/queue.
BEGIN;
-- Acquire all existing parents and children together. A legacy child-first
-- writer must be able to finish; retry releases every root acquired so far.
DO $$ BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   LOCK TABLE auth.users,public.profiles,public.user_flags,public.email_unsub_tokens,
    public.games,public.question_bases,public.control_runtime_sessions,
    public.poll_subscriptions,public.friendships,public.poll_tasks,public.base_share_tasks,
    public.control_device_shares,public.reports,public.messages,public.mail_queue,
    public.mail_cooldowns,public.poll_mail_budget_events IN ACCESS EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN IF attempt=1000 THEN RAISE; END IF; END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

-- Consolidated source: draft-mail-center-access-360.sql
-- LOCAL PROTOTYPE ONLY: service-only capabilities, never upgrade sender-visible u tokens.
CREATE TABLE public.mail_center_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 email text NOT NULL CHECK(email=public._norm_email(email)),
 root_token uuid NOT NULL REFERENCES public.email_unsub_tokens(token) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN('footer','verification')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX ON public.mail_center_links(email) WHERE revoked_at IS NULL;
CREATE TABLE public.mail_center_sessions (
 secret_hash text PRIMARY KEY CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 link_id uuid NOT NULL REFERENCES public.mail_center_links(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
ALTER TABLE public.mail_center_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_center_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_center_links,public.mail_center_sessions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._mail_center_identity_lock(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE before_uid uuid; after_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_uid:=public._poll_registered_uid(p_email);
   PERFORM 1 FROM auth.users WHERE id=before_uid FOR SHARE NOWAIT;
   IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||p_email,351)) THEN
    RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03';
   END IF;
   after_uid:=public._poll_registered_uid(p_email);
   IF before_uid IS DISTINCT FROM after_uid THEN RAISE EXCEPTION 'mail identity changed' USING ERRCODE='55P03'; END IF;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mail_center_issue_link(p_email text,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text:=public._norm_email(p_email); secret text; root_id uuid; link_id uuid; deadline timestamptz;
BEGIN
 IF mailbox IS NULL OR length(mailbox)>320 OR mailbox !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_purpose IS NULL OR p_purpose NOT IN('footer','verification') THEN
  RETURN jsonb_build_object('ok',false,'error','invalid_request');
 END IF;
 PERFORM public._mail_center_identity_lock(mailbox);
 IF p_purpose='verification' AND public._poll_registered_uid(mailbox) IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'error','requires_login');
 END IF;
 root_id:=public._ensure_unsub_token(mailbox);
 secret:=encode(public.gen_random_bytes(32),'hex');
 deadline:=clock_timestamp()+CASE WHEN p_purpose='footer' THEN interval '30 days' ELSE interval '15 minutes' END;
 INSERT INTO public.mail_center_links(token_hash,email,root_token,purpose,expires_at)
 VALUES(encode(sha256(convert_to(secret,'UTF8')),'hex'),mailbox,root_id,p_purpose,deadline) RETURNING id INTO link_id;
 RETURN jsonb_build_object('ok',true,'token',secret,'expires_at',deadline,'link_id',link_id);
END $$;

CREATE OR REPLACE FUNCTION public.mail_center_exchange_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE link public.mail_center_links; hashed text; secret text; deadline timestamptz;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 hashed:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 SELECT * INTO link FROM public.mail_center_links WHERE token_hash=hashed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_center_identity_lock(link.email);
 SELECT * INTO link FROM public.mail_center_links WHERE token_hash=hashed FOR UPDATE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL OR link.expires_at<=clock_timestamp()
   OR (link.purpose='verification' AND link.consumed_at IS NOT NULL) THEN
  RETURN jsonb_build_object('ok',false,'error','expired_token');
 END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 IF link.purpose='verification' THEN UPDATE public.mail_center_links SET consumed_at=clock_timestamp() WHERE id=link.id; END IF;
 secret:=encode(public.gen_random_bytes(32),'hex');
 deadline:=least(clock_timestamp()+interval '24 hours',link.expires_at);
 -- Verification link expiry only limits exchange, not the verified session.
 IF link.purpose='verification' THEN deadline:=clock_timestamp()+interval '24 hours'; END IF;
 INSERT INTO public.mail_center_sessions(secret_hash,link_id,expires_at)
 VALUES(encode(sha256(convert_to(secret,'UTF8')),'hex'),link.id,deadline);
 RETURN jsonb_build_object('ok',true,'session_secret',secret,'expires_at',deadline);
END $$;

CREATE OR REPLACE FUNCTION public._mail_center_scope(p_secret text,p_touch boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE sess public.mail_center_sessions; link public.mail_center_links; hashed text;
BEGIN
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 hashed:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 SELECT * INTO sess FROM public.mail_center_sessions WHERE secret_hash=hashed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 SELECT * INTO link FROM public.mail_center_links WHERE id=sess.link_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','expired_session'); END IF;
 PERFORM public._mail_center_identity_lock(link.email);
 SELECT * INTO link FROM public.mail_center_links WHERE id=sess.link_id FOR UPDATE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','expired_session'); END IF;
 SELECT * INTO sess FROM public.mail_center_sessions WHERE secret_hash=hashed FOR UPDATE;
 IF NOT FOUND OR sess.revoked_at IS NOT NULL OR sess.expires_at<=clock_timestamp()
   OR sess.last_seen_at<=clock_timestamp()-interval '1 hour' THEN
  RETURN jsonb_build_object('ok',false,'error','expired_session');
 END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 IF p_touch THEN UPDATE public.mail_center_sessions SET last_seen_at=clock_timestamp() WHERE secret_hash=hashed; END IF;
 RETURN jsonb_build_object('ok',true,'email',link.email,'notifications_enabled',public._contact_mail_enabled(link.email));
END $$;

CREATE OR REPLACE FUNCTION public._mail_center_identity_invalidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailboxes text[];
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='INSERT' OR NEW.is_guest IS NOT DISTINCT FROM OLD.is_guest THEN RETURN NEW; END IF;
  SELECT ARRAY[public._norm_email(email)] INTO mailboxes FROM auth.users WHERE id=NEW.id;
 ELSIF TG_OP='UPDATE' THEN
  IF public._norm_email(NEW.email) IS NOT DISTINCT FROM public._norm_email(OLD.email)
   AND NEW.is_anonymous IS NOT DISTINCT FROM OLD.is_anonymous
   AND (NEW.email_confirmed_at IS NOT NULL) IS NOT DISTINCT FROM (OLD.email_confirmed_at IS NOT NULL)
   AND (NEW.raw_user_meta_data->>'is_guest') IS NOT DISTINCT FROM (OLD.raw_user_meta_data->>'is_guest') THEN RETURN NEW; END IF;
  mailboxes:=ARRAY[public._norm_email(OLD.email),public._norm_email(NEW.email)];
 ELSIF TG_OP='INSERT' THEN
  IF NOT public._poll_identity_regular(NEW.id,to_jsonb(NEW)) THEN RETURN NEW; END IF;
  mailboxes:=ARRAY[public._norm_email(NEW.email)];
 ELSE mailboxes:=ARRAY[public._norm_email(OLD.email)]; END IF;
 PERFORM public._poll_identity_mail_locks(mailboxes);
 UPDATE public.mail_center_links SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE email=ANY(mailboxes) AND revoked_at IS NULL;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_mail_center_auth_invalidate AFTER INSERT OR UPDATE OR DELETE ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_identity_invalidate();
CREATE TRIGGER zz_mail_center_profile_invalidate AFTER UPDATE OF is_guest ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_identity_invalidate();
REVOKE ALL ON FUNCTION public._mail_center_identity_lock(text),public.mail_center_issue_link(text,text),public.mail_center_exchange_link(text),public._mail_center_scope(text,boolean),public._mail_center_identity_invalidate() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_issue_link(text,text),public.mail_center_exchange_link(text),public._mail_center_scope(text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_center_peek_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE link public.mail_center_links;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 SELECT * INTO link FROM public.mail_center_links WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_center_identity_lock(link.email);
 SELECT * INTO link FROM public.mail_center_links WHERE id=link.id FOR SHARE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL OR link.expires_at<=clock_timestamp() OR (link.purpose='verification' AND link.consumed_at IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'error','expired_token'); END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 RETURN jsonb_build_object('ok',true,'purpose',link.purpose);
END $$;
REVOKE ALL ON FUNCTION public.mail_center_peek_link(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_peek_link(text) TO service_role;

-- Consolidated source: draft-mail-center-resignation-360.sql
-- LOCAL ONLY. Latest decision: mail-only global resignation closes all owned sources.
-- Registered-account access cancellation awaits explicit scope clarification.
CREATE OR REPLACE FUNCTION public._mail_anon_source_owners(p_email text)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) FROM (
  SELECT owner_id AS id FROM public.poll_subscriptions WHERE public._norm_email(subscriber_email)=p_email
    AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND status IN('pending','active')
  UNION SELECT owner_id FROM public.poll_tasks WHERE public._norm_email(recipient_email)=p_email
    AND recipient_user_id IS NULL AND status IN('pending','opened')
  UNION SELECT owner_id FROM public.control_device_shares WHERE public._norm_email(recipient_email)=p_email
    AND recipient_id IS NULL AND revoked_at IS NULL
  UNION SELECT public._poll_registered_uid(p_email)
  UNION SELECT auth.uid()
 ) roots WHERE id IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public._mail_anon_source_locks(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE before_ids uuid[]; after_ids uuid[]; owner_id uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_ids:=public._mail_anon_source_owners(p_email);
   PERFORM 1 FROM auth.users WHERE id=ANY(before_ids) ORDER BY id FOR SHARE NOWAIT;
   IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||p_email,351)) THEN
    RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03';
   END IF;
   after_ids:=public._mail_anon_source_owners(p_email);
   IF after_ids IS DISTINCT FROM before_ids THEN RAISE EXCEPTION 'mail parents changed' USING ERRCODE='55P03'; END IF;
   FOR owner_id IN SELECT s.owner_id FROM public.poll_subscriptions s WHERE public._norm_email(s.subscriber_email)=p_email
     AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND s.status IN('pending','active') ORDER BY s.owner_id,s.id LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended(owner_id::text||':email:'||p_email,333)) THEN
     RAISE EXCEPTION 'contact pair busy' USING ERRCODE='55P03';
    END IF;
   END LOOP;
   PERFORM 1 FROM public.games WHERE id IN(
    SELECT game_id FROM public.poll_tasks WHERE recipient_user_id IS NULL AND public._norm_email(recipient_email)=p_email AND status IN('pending','opened')
    UNION SELECT game_id FROM public.control_device_shares WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=p_email AND revoked_at IS NULL
   ) ORDER BY id FOR UPDATE NOWAIT;
   PERFORM 1 FROM public.control_runtime_sessions WHERE id IN(
    SELECT session_id FROM public.control_device_shares WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=p_email AND revoked_at IS NULL
   ) ORDER BY id FOR UPDATE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.mail_anon_resign(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; root_token uuid; item record; closed integer:=0; tasks integer; devices integer;
BEGIN
 SELECT public._norm_email(email) INTO mailbox FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 IF public._poll_registered_uid(mailbox) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 SELECT token INTO root_token FROM public.email_unsub_tokens WHERE token=p_token AND public._norm_email(email)=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,now()) WHERE token=root_token;
 FOR item IN SELECT token FROM public.poll_subscriptions WHERE public._norm_email(subscriber_email)=mailbox
   AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND status IN('pending','active') ORDER BY owner_id,id LOOP
  IF public._subscriber_close(item.token,true) THEN closed:=closed+1; END IF;
 END LOOP;
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=coalesce(cancelled_at,now())
  WHERE recipient_user_id IS NULL AND public._norm_email(recipient_email)=mailbox AND status IN('pending','opened');
 GET DIAGNOSTICS tasks=ROW_COUNT;
 UPDATE public.control_device_shares SET revoked_at=coalesce(revoked_at,now())
  WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=mailbox AND revoked_at IS NULL;
 GET DIAGNOSTICS devices=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'subscriptions_closed',closed,'tasks_closed',tasks,'devices_revoked',devices);
END $$;
REVOKE ALL ON FUNCTION public._mail_anon_source_owners(text),public._mail_anon_source_locks(text),public.mail_anon_resign(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mail_center_set_notifications(p_secret text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; scope jsonb; result jsonb; root uuid;
BEGIN
 IF p_enabled IS NULL OR p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 -- Resolve parents without row locks, acquire source roots before link/session locks.
 SELECT l.email INTO mailbox FROM public.mail_center_sessions s
 JOIN public.mail_center_links l ON l.id=s.link_id
 WHERE s.secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
   AND s.revoked_at IS NULL AND l.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 scope:=public._mail_center_scope(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 IF scope->>'email' IS DISTINCT FROM mailbox THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 SELECT token INTO root FROM public.email_unsub_tokens WHERE email=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF p_enabled THEN
  UPDATE public.email_unsub_tokens SET suppressed_at=NULL WHERE token=root;
  RETURN jsonb_build_object('ok',true,'notifications_enabled',true);
 END IF;
 result:=public.mail_anon_resign(root);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RETURN result; END IF;
 RETURN result||jsonb_build_object('notifications_enabled',false);
END $$;
REVOKE ALL ON FUNCTION public.mail_center_set_notifications(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_set_notifications(text,boolean) TO service_role;

-- Consolidated source: draft-mail-center-lists-360.sql
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

-- Consolidated source: draft-mail-center-source-guards-360.sql

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

CREATE OR REPLACE FUNCTION public._mail_center_anon_source_insert_guard()
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
REVOKE ALL ON FUNCTION public._mail_center_anon_source_insert_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_mail_center_anon_source_guard BEFORE INSERT ON public.poll_tasks
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_anon_source_insert_guard();
CREATE TRIGGER zz_mail_center_anon_source_guard BEFORE INSERT ON public.poll_subscriptions
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_anon_source_insert_guard();
CREATE TRIGGER zz_mail_center_anon_source_guard BEFORE INSERT ON public.control_device_shares
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_anon_source_insert_guard();

-- Consolidated source: draft-mail-center-confirmation-360.sql
ALTER TABLE public.mail_queue ADD COLUMN mail_center_link_id uuid
 REFERENCES public.mail_center_links(id) ON DELETE CASCADE;
CREATE TABLE public.mail_center_request_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email_hash text NOT NULL, ip_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.mail_center_request_events(email_hash,created_at);
CREATE INDEX ON public.mail_center_request_events(ip_hash,created_at);
ALTER TABLE public.mail_center_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_center_request_events FROM PUBLIC,anon,authenticated;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
 VALUES('mail:center_verify','email',60,true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._mail_center_verification_live(p_link uuid,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.mail_center_links l JOIN public.email_unsub_tokens r ON r.token=l.root_token
  WHERE l.id=p_link AND l.email=public._norm_email(p_email) AND r.email=l.email AND l.purpose='verification'
   AND l.revoked_at IS NULL AND l.consumed_at IS NULL AND l.expires_at>clock_timestamp())
  AND public._poll_registered_uid(p_email) IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.mail_center_request_link(p_email text,p_ip_hash text,p_subject text,p_html text,p_lang text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text:=public._norm_email(p_email); address_hash text; issued jsonb; queue_id uuid; seconds integer; deadline timestamptz;
BEGIN
 IF mailbox IS NULL OR length(mailbox)>320 OR mailbox !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'
  OR p_ip_hash IS NULL OR p_ip_hash !~ '^[a-f0-9]{64}$' OR p_html IS NULL OR length(p_html)>100000
  OR p_html NOT LIKE '%MAIL_CENTER_ACCESS_TOKEN%' OR p_subject IS NULL OR length(p_subject)>500
  OR p_lang IS NULL OR p_lang NOT IN('pl','en','uk') THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 PERFORM public._mail_center_identity_lock(mailbox);
 PERFORM pg_advisory_xact_lock(hashtextextended('mail:center-ip:'||p_ip_hash,360));
 address_hash:=encode(sha256(convert_to(mailbox,'UTF8')),'hex');
 IF (SELECT count(*) FROM public.mail_center_request_events WHERE ip_hash=p_ip_hash AND created_at>clock_timestamp()-interval '15 minutes')>=10 THEN
  RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',900);
 END IF;
 IF public._poll_registered_uid(mailbox) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 seconds:=greatest(60,coalesce((SELECT cooldown_seconds FROM public.mail_cooldown_policies WHERE action_key='baseline:recipient'),60));
 SELECT max(created_at)+make_interval(secs=>seconds) INTO deadline FROM public.mail_center_request_events WHERE email_hash=address_hash;
 IF deadline>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',ceil(extract(epoch FROM deadline-clock_timestamp()))::integer); END IF;
 IF (SELECT count(*) FROM public.mail_center_request_events WHERE email_hash=address_hash AND created_at>clock_timestamp()-interval '24 hours')>=10 THEN
  RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',86400);
 END IF;
 issued:=public.mail_center_issue_link(mailbox,'verification');
 IF issued->>'ok' IS DISTINCT FROM 'true' THEN RETURN issued; END IF;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,text,cooldown_action_key,cooldown_target_key,mail_center_link_id,meta)
 VALUES(NULL,mailbox,p_subject,replace(p_html,'MAIL_CENTER_ACCESS_TOKEN',issued->>'token'),
  p_subject||' https://www.familiada.online/go/?m='||(issued->>'token'),
  'mail:center_verify','email:'||md5(mailbox),(issued->>'link_id')::uuid,jsonb_build_object('lang',p_lang)) RETURNING id INTO queue_id;
 IF queue_id IS NULL THEN RAISE EXCEPTION 'verification_queue_insert_failed'; END IF;
 INSERT INTO public.mail_center_request_events(email_hash,ip_hash) VALUES(address_hash,p_ip_hash);
 -- The caller sees no capability, HTML, or source id. Only actual delivery reveals it.
 RETURN jsonb_build_object('ok',true,'cooldown_seconds',seconds);
END $$;
REVOKE ALL ON FUNCTION public._mail_center_verification_live(uuid,text),public.mail_center_request_link(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_request_link(text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION "public"."mail_queue_notification_preference_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_notifications_enabled boolean;
BEGIN
  IF NEW.cooldown_action_key='mail:center_verify' THEN
    IF NEW.created_by IS NOT NULL OR NEW.mail_center_link_id IS NULL
      OR NOT public._mail_center_verification_live(NEW.mail_center_link_id,NEW.to_email) THEN
      RAISE EXCEPTION 'invalid_verification_source';
    END IF;
    RETURN NEW;
  END IF;
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

-- Consolidated source: draft-mail-center-delivery-360.sql
-- The notification source graph follows in the same transaction.
ALTER TABLE public.mail_queue ADD COLUMN contact_message_id uuid
 REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.mail_queue ADD COLUMN contact_source_expected boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public._mail_contact_source_live(p_message uuid,p_email text,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.messages m JOIN public.reports r ON r.id=m.report_id
  WHERE m.id=p_message AND m.direction='inbound' AND m.deleted_at IS NULL
    AND public._norm_email(m.from_email)=public._norm_email(p_email)
    AND ((p_action='contact:confirmation' AND m.source='form' AND m.created_at>clock_timestamp()-interval '24 hours')
      OR (p_action='admin:compose' AND m.source IN('form','email'))));
$$;
REVOKE ALL ON FUNCTION public._mail_contact_source_live(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mail_contact_reply_source(p_report uuid,p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT m.id FROM public.messages m WHERE m.report_id=p_report
  AND public._mail_contact_source_live(m.id,p_email,'admin:compose')
  ORDER BY m.created_at DESC,m.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.mail_contact_reply_source(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_contact_reply_source(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_queue_delivery_context(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; initial public.mail_queue; link public.mail_center_links;
 root_id uuid; issued jsonb; current_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT * INTO initial FROM public.mail_queue WHERE id=p_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   PERFORM public._mail_center_identity_lock(public._norm_email(initial.to_email));
   current_uid:=public._poll_registered_uid(initial.to_email);
   PERFORM 1 FROM public.user_flags WHERE user_id=current_uid FOR SHARE NOWAIT;
   IF initial.cooldown_action_key='mail:center_verify' THEN
    SELECT * INTO link FROM public.mail_center_links WHERE id=initial.mail_center_link_id FOR SHARE NOWAIT;
   ELSE
    IF initial.contact_message_id IS NOT NULL THEN
     PERFORM 1 FROM public.reports WHERE id=(SELECT report_id FROM public.messages WHERE id=initial.contact_message_id) FOR SHARE NOWAIT;
     PERFORM 1 FROM public.messages WHERE id=initial.contact_message_id FOR SHARE NOWAIT;
    END IF;
    root_id:=public._ensure_unsub_token(initial.to_email);
    PERFORM 1 FROM public.email_unsub_tokens WHERE token=root_id FOR SHARE NOWAIT;
   END IF;
   SELECT * INTO q FROM public.mail_queue WHERE id=p_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF public._norm_email(q.to_email) IS DISTINCT FROM public._norm_email(initial.to_email)
    OR q.cooldown_action_key IS DISTINCT FROM initial.cooldown_action_key
    OR q.mail_center_link_id IS DISTINCT FROM initial.mail_center_link_id
    OR q.contact_message_id IS DISTINCT FROM initial.contact_message_id
    OR q.contact_source_expected IS DISTINCT FROM initial.contact_source_expected THEN
     RAISE EXCEPTION 'delivery source changed' USING ERRCODE='55P03';
   END IF;
   IF q.status<>'sending' THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_not_claimed'); END IF;
   IF q.cooldown_action_key='mail:center_verify' THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_center_verification_live(q.mail_center_link_id,q.to_email) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_verification_closed');
    END IF;
    -- Global mail-off is intentionally bypassed only for this private proof.
    RETURN jsonb_build_object('ok',true,'allowed',true,'verification',true,'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
   END IF;
   IF q.contact_source_expected OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id IS NOT NULL THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_contact_source_live(q.contact_message_id,q.to_email,q.cooldown_action_key) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_contact_closed');
    END IF;
   ELSIF NOT public._contact_mail_enabled(q.to_email) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_preference');
   END IF;
   issued:=public.mail_center_issue_link(q.to_email,'footer');
   IF issued->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'delivery footer unavailable'; END IF;
   -- The full capability is returned only to delivery; never write it to q.html.
   RETURN jsonb_build_object('ok',true,'allowed',true,'verification',false,'footer_token',issued->>'token',
     'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mail_queue_delivery_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_queue_delivery_context(uuid) TO service_role;

-- Keep the same final preference guard, with two private requested exceptions.
CREATE OR REPLACE FUNCTION public.mail_queue_notification_preference_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF NEW.cooldown_action_key='mail:center_verify' THEN
  IF NEW.created_by IS NOT NULL OR NEW.mail_center_link_id IS NULL
    OR NOT public._mail_center_verification_live(NEW.mail_center_link_id,NEW.to_email) THEN RAISE EXCEPTION 'invalid_verification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.cooldown_action_key='contact:confirmation' OR NEW.contact_message_id IS NOT NULL THEN
  IF NEW.created_by IS NOT NULL OR NOT public._mail_contact_source_live(NEW.contact_message_id,NEW.to_email,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_contact_source'; END IF;
  NEW.contact_source_expected:=true;
  RETURN NEW;
 END IF;
 NEW.contact_source_expected:=false;
 IF NOT public._contact_mail_enabled(NEW.to_email) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;

-- Consolidated source: draft-mail-center-preferences-360.sql
-- Registered access cancellation is deliberately unchanged pending scope decision.
CREATE OR REPLACE FUNCTION public.get_my_email_notifications(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT public._norm_email(u.email) INTO mailbox FROM auth.users u
  WHERE u.id=p_user_id AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR SHARE;
 IF NOT FOUND OR mailbox IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM public._mail_center_identity_lock(mailbox);
 RETURN public._contact_mail_enabled(mailbox);
END $$;
CREATE OR REPLACE FUNCTION public.set_my_email_notifications(p_user_id uuid,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; confirmed timestamptz; root uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id OR p_enabled IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT public._norm_email(u.email),u.email_confirmed_at INTO mailbox,confirmed FROM auth.users u
    WHERE u.id=p_user_id AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR SHARE NOWAIT;
   IF NOT FOUND OR mailbox IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF p_enabled AND confirmed IS NULL THEN RAISE EXCEPTION 'email_not_confirmed'; END IF;
   PERFORM public._mail_center_identity_lock(mailbox);
   SELECT token INTO root FROM public.email_unsub_tokens WHERE email=mailbox FOR UPDATE NOWAIT;
   IF NOT FOUND THEN root:=public._ensure_unsub_token(mailbox); END IF;
   PERFORM 1 FROM public.user_flags WHERE user_id=p_user_id FOR UPDATE NOWAIT;
   INSERT INTO public.user_flags(user_id,email_notifications) VALUES(p_user_id,p_enabled)
    ON CONFLICT(user_id) DO UPDATE SET email_notifications=excluded.email_notifications;
   UPDATE public.email_unsub_tokens SET suppressed_at=CASE WHEN p_enabled THEN NULL ELSE coalesce(suppressed_at,clock_timestamp()) END WHERE token=root;
   RETURN public._contact_mail_enabled(mailbox);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_my_email_notifications(uuid),public.set_my_email_notifications(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_email_notifications(uuid),public.set_my_email_notifications(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_profile_created_check_suppression()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text;
BEGIN
 SELECT public._norm_email(u.email) INTO mailbox FROM auth.users u
  WHERE u.id=NEW.id AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF mailbox IS NOT NULL AND EXISTS(SELECT 1 FROM public.email_unsub_tokens WHERE email=mailbox AND suppressed_at IS NOT NULL) THEN
  INSERT INTO public.user_flags(user_id,email_notifications) VALUES(NEW.id,false)
   ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 END IF;
 -- Root stays: account creation is not an instruction to enable notifications.
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.poll_go_global_unsubscribe(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text; result jsonb;
BEGIN
 SELECT email INTO mailbox FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 IF public._poll_registered_uid(mailbox) IS NULL THEN
  result:=public.mail_anon_resign(p_token);
  -- Preserve old unsubscribe authority without exposing private lists/counts.
  RETURN jsonb_build_object('ok',result->>'ok'='true');
 END IF;
 PERFORM 1 FROM public.email_unsub_tokens WHERE token=p_token AND email=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,clock_timestamp()) WHERE token=p_token;
 -- Account mail-off affects mail only; accesses retain their own decisions.
 RETURN jsonb_build_object('ok',true);
END $$;

-- Consolidated source: draft-mail-center-cleanup-360.sql
CREATE INDEX ON public.mail_center_links(expires_at);
CREATE INDEX ON public.mail_center_sessions(link_id);
CREATE OR REPLACE FUNCTION public.mail_center_cleanup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate record; link public.mail_center_links; dropped_sessions integer:=0; dropped_links integer:=0; dropped_events integer:=0; affected integer;
BEGIN
 FOR candidate IN SELECT id FROM public.mail_center_links l
  WHERE revoked_at IS NOT NULL OR expires_at<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM public.mail_center_sessions s WHERE s.link_id=l.id
      AND (s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.last_seen_at<=clock_timestamp()-interval '1 hour'))
  ORDER BY id LIMIT 500 LOOP
  BEGIN
   SELECT * INTO link FROM public.mail_center_links WHERE id=candidate.id FOR UPDATE NOWAIT;
   IF NOT FOUND THEN CONTINUE; END IF;
   -- Preflight children without waiting; concurrent parent-first access and
   -- legacy child-first queue operations cannot create a lock cycle.
   PERFORM 1 FROM public.mail_center_sessions WHERE link_id=link.id ORDER BY secret_hash FOR UPDATE NOWAIT;
   PERFORM 1 FROM public.mail_queue WHERE mail_center_link_id=link.id ORDER BY id FOR UPDATE NOWAIT;
   DELETE FROM public.mail_center_sessions WHERE link_id=link.id
    AND (link.revoked_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at<=clock_timestamp() OR last_seen_at<=clock_timestamp()-interval '1 hour');
   GET DIAGNOSTICS affected=ROW_COUNT; dropped_sessions:=dropped_sessions+affected;
   IF link.revoked_at IS NOT NULL OR (link.expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.mail_center_sessions WHERE link_id=link.id)) THEN
    DELETE FROM public.mail_center_links WHERE id=link.id;
    dropped_links:=dropped_links+1;
   END IF;
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
 END LOOP;
 DELETE FROM public.mail_center_request_events WHERE created_at<=clock_timestamp()-interval '48 hours';
 GET DIAGNOSTICS dropped_events=ROW_COUNT;
 RETURN jsonb_build_object('sessions_removed',dropped_sessions,'links_removed',dropped_links,'events_removed',dropped_events);
END $$;
REVOKE ALL ON FUNCTION public.mail_center_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_cleanup() TO service_role;

-- Consolidated source: draft-mail-notification-sources-361.sql
ALTER TABLE public.mail_queue
 ADD COLUMN notification_source_kind text CHECK(notification_source_kind IN('friend','subscription','poll','base','device')),
 ADD COLUMN notification_source_token uuid,
 ADD COLUMN notification_friendship_id uuid REFERENCES public.friendships(id) ON DELETE CASCADE,
 ADD COLUMN notification_subscription_id uuid REFERENCES public.poll_subscriptions(id) ON DELETE CASCADE,
 ADD COLUMN notification_poll_task_id uuid REFERENCES public.poll_tasks(id) ON DELETE CASCADE,
 ADD COLUMN notification_base_task_id uuid REFERENCES public.base_share_tasks(id) ON DELETE CASCADE,
 ADD COLUMN notification_device_share_id uuid REFERENCES public.control_device_shares(id) ON DELETE CASCADE,
 ADD COLUMN notification_snapshot jsonb;
CREATE INDEX ON public.mail_queue(notification_friendship_id) WHERE notification_friendship_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_subscription_id) WHERE notification_subscription_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_poll_task_id) WHERE notification_poll_task_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_base_task_id) WHERE notification_base_task_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_device_share_id) WHERE notification_device_share_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._mail_notification_action_matches(p_kind text,p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(CASE p_kind WHEN 'friend' THEN p_action IN('friend:invite','friend:resend')
  WHEN 'subscription' THEN p_action IN('poll:invite','poll:resend') WHEN 'poll' THEN p_action='poll:share'
  WHEN 'base' THEN p_action='base:share' WHEN 'device' THEN p_action='device:share' ELSE false END,false);
$$;

CREATE OR REPLACE FUNCTION public._mail_notification_source_info(q public.mail_queue)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb;
BEGIN
 CASE q.notification_source_kind
 WHEN 'friend' THEN
  SELECT jsonb_build_object('owner_id',CASE WHEN f.decision_user_id=f.requester_id THEN f.addressee_id ELSE f.requester_id END,
   'recipient_id',f.decision_user_id,'email',public._norm_email(u.email),
   'friendship_id',f.id,'subscription_id',f.source_subscription_id,
   'active',f.status='pending' AND f.cancelled_at IS NULL AND (f.source_subscription_id IS NULL
    OR EXISTS(SELECT 1 FROM public.poll_subscriptions s WHERE s.id=f.source_subscription_id AND s.owner_id=f.requester_id
      AND coalesce(s.registered_user_id,s.subscriber_user_id)=f.addressee_id
      AND s.status IN('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL)),
   'snapshot',jsonb_build_object('source_subscription_id',f.source_subscription_id)) INTO info
  FROM public.friendships f JOIN auth.users u ON u.id=f.decision_user_id
  WHERE f.id=q.notification_friendship_id AND f.token=q.notification_source_token;
 WHEN 'subscription' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',coalesce(s.registered_user_id,s.subscriber_user_id),
   'email',public._norm_email(s.subscriber_email),'subscription_id',s.id,
   'active',s.status='pending' AND s.cancelled_at IS NULL AND s.declined_at IS NULL
    AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL,
   'snapshot',jsonb_build_object('subscriber_email',public._norm_email(s.subscriber_email))) INTO info
  FROM public.poll_subscriptions s WHERE s.id=q.notification_subscription_id AND s.token=q.notification_source_token;
 WHEN 'poll' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,
   'email',public._norm_email(CASE WHEN t.recipient_user_id IS NULL THEN t.recipient_email ELSE u.email END),
   'game_id',t.game_id,'friendship_id',t.source_friendship_id,'subscription_id',t.source_subscription_id,
   'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND g.owner_id=t.owner_id AND g.status::text='poll_open' AND g.type::text=t.poll_type
    AND g.share_key_poll=t.share_key_poll AND public._poll_task_source_active(t),
   'snapshot',jsonb_build_object('game_id',t.game_id,'poll_key',t.share_key_poll,'poll_type',t.poll_type)) INTO info
  FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id
  WHERE t.id=q.notification_poll_task_id AND t.token=q.notification_source_token;
 WHEN 'base' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,'email',public._norm_email(u.email),
   'base_id',t.base_id,'friendship_id',t.source_friendship_id,
   'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND t.created_at>clock_timestamp()-interval '5 days' AND b.owner_id=t.owner_id AND public._base_task_source_active(t),
   'snapshot',jsonb_build_object('base_id',t.base_id,'role',t.role)) INTO info
  FROM public.base_share_tasks t JOIN public.question_bases b ON b.id=t.base_id JOIN auth.users u ON u.id=t.recipient_user_id
  WHERE t.id=q.notification_base_task_id AND t.token=q.notification_source_token;
 WHEN 'device' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',s.recipient_id,
   'email',public._norm_email(CASE WHEN s.recipient_id IS NULL THEN s.recipient_email ELSE u.email END),
   'game_id',s.game_id,'session_id',s.session_id,
   'active',s.revoked_at IS NULL AND g.owner_id=s.owner_id AND rs.game_id=s.game_id AND rs.owner_id=s.owner_id
    AND rs.ended_at IS NULL AND rs.expires_at>clock_timestamp() AND rs.last_activity_at>clock_timestamp()-interval '1 hour',
   'snapshot',jsonb_build_object('game_id',s.game_id,'session_id',s.session_id,'device_type',s.device_type)) INTO info
  FROM public.control_device_shares s JOIN public.games g ON g.id=s.game_id JOIN public.control_runtime_sessions rs ON rs.id=s.session_id
   LEFT JOIN auth.users u ON u.id=s.recipient_id
  WHERE s.id=q.notification_device_share_id AND s.token=q.notification_source_token;
 ELSE RETURN NULL;
 END CASE;
 RETURN info;
END $$;

CREATE OR REPLACE FUNCTION public._mail_notification_source_live(q public.mail_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb; owner_id uuid; recipient_id uuid; mailbox text;
BEGIN
 IF NOT public._mail_notification_action_matches(q.notification_source_kind,q.cooldown_action_key) THEN RETURN false; END IF;
 info:=public._mail_notification_source_info(q);
 IF info IS NULL OR info->>'active' IS DISTINCT FROM 'true' OR q.notification_snapshot IS NULL THEN RETURN false; END IF;
 owner_id:=(info->>'owner_id')::uuid; recipient_id:=(info->>'recipient_id')::uuid; mailbox:=info->>'email';
 IF q.created_by IS DISTINCT FROM owner_id OR public._norm_email(q.to_email) IS DISTINCT FROM mailbox
   OR q.notification_snapshot->'resource' IS DISTINCT FROM info->'snapshot'
   OR (q.notification_snapshot->>'recipient_id')::uuid IS DISTINCT FROM recipient_id
   OR (q.notification_snapshot->>'identity_id')::uuid IS DISTINCT FROM public._poll_registered_uid(mailbox) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=owner_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 IF recipient_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=recipient_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 RETURN public._contact_mail_enabled(mailbox);
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_action_matches(text,text),public._mail_notification_source_info(public.mail_queue),public._mail_notification_source_live(public.mail_queue) FROM PUBLIC,anon,authenticated;

-- Consolidated source: draft-mail-notification-allocations-361.sql
-- their successful response creates one private permission to enqueue a mail.
CREATE TABLE public.mail_notification_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 lifecycle_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 identity_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 to_email text NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('friend','subscription','poll','base','device')),
 source_token uuid NOT NULL,
 friendship_id uuid REFERENCES public.friendships(id) ON DELETE CASCADE,
 subscription_id uuid REFERENCES public.poll_subscriptions(id) ON DELETE CASCADE,
 poll_task_id uuid REFERENCES public.poll_tasks(id) ON DELETE CASCADE,
 base_task_id uuid REFERENCES public.base_share_tasks(id) ON DELETE CASCADE,
 device_share_id uuid REFERENCES public.control_device_shares(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 enqueue_before timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 consumed_at timestamptz,
 consumed_queue_id uuid,
 revoked_at timestamptz,
 CHECK(num_nonnulls(friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id)=1),
 CHECK((consumed_at IS NULL)=(consumed_queue_id IS NULL))
);
ALTER TABLE public.mail_notification_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_notification_allocations FROM PUBLIC,anon,authenticated;
CREATE INDEX ON public.mail_notification_allocations(source_kind,source_token,created_at DESC) WHERE consumed_at IS NULL AND revoked_at IS NULL;
ALTER TABLE public.mail_queue ADD COLUMN notification_allocation_id uuid
 REFERENCES public.mail_notification_allocations(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ON public.mail_queue(notification_allocation_id) WHERE notification_allocation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._mail_notification_probe(p_kind text,p_id uuid,p_action text)
RETURNS public.mail_queue LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; info jsonb;
BEGIN
 q.created_by:=auth.uid(); q.notification_source_kind:=p_kind; q.cooldown_action_key:=p_action;
 CASE p_kind
  WHEN 'friend' THEN q.notification_friendship_id:=p_id;SELECT token INTO q.notification_source_token FROM public.friendships WHERE id=p_id;
  WHEN 'subscription' THEN q.notification_subscription_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_subscriptions WHERE id=p_id;
  WHEN 'poll' THEN q.notification_poll_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_tasks WHERE id=p_id;
  WHEN 'base' THEN q.notification_base_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.base_share_tasks WHERE id=p_id;
  WHEN 'device' THEN q.notification_device_share_id:=p_id;SELECT token INTO q.notification_source_token FROM public.control_device_shares WHERE id=p_id;
  ELSE RETURN NULL;
 END CASE;
 info:=public._mail_notification_source_info(q);
 IF info IS NULL THEN RETURN NULL; END IF;
 q.to_email:=info->>'email';
 q.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(q.to_email));
 RETURN q;
END $$;

CREATE OR REPLACE FUNCTION public._mail_allocate_notification(p_kind text,p_id uuid,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; allocation_id uuid;
BEGIN
 -- Only called inside an already validated, budget-reserving invitation RPC.
 -- Do not acquire parents after its child locks; original RPC holds its roots.
 q:=public._mail_notification_probe(p_kind,p_id,p_action);
 IF q IS NULL THEN RETURN NULL; END IF;
 -- Serialize a flag change with minting. NOWAIT permits the RPC wrapper to
 -- release its source locks and retry rather than wait behind child-first code.
 PERFORM 1 FROM public.user_flags WHERE user_id=(q.notification_snapshot->>'identity_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=public._norm_email(q.to_email) FOR SHARE NOWAIT;
 IF q IS NULL OR NOT public._mail_notification_source_live(q) THEN RETURN NULL; END IF;
 -- A later successful reminder replaces an unused earlier enqueue permission.
 UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
  WHERE source_kind=p_kind AND source_token=q.notification_source_token
   AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.mail_notification_allocations(owner_id,lifecycle_owner_id,recipient_id,identity_id,to_email,source_kind,source_token,
  friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id,snapshot)
 VALUES(q.created_by,q.created_by,(q.notification_snapshot->>'recipient_id')::uuid,(q.notification_snapshot->>'identity_id')::uuid,q.to_email,p_kind,q.notification_source_token,
  q.notification_friendship_id,q.notification_subscription_id,q.notification_poll_task_id,q.notification_base_task_id,q.notification_device_share_id,q.notification_snapshot)
 RETURNING id INTO allocation_id;
 RETURN allocation_id;
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_probe(text,uuid,text),public._mail_allocate_notification(text,uuid,text) FROM PUBLIC,anon,authenticated;

-- Consolidated source: draft-mail-notification-rpc-361.sql
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
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' AND result->>'id' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',(result->>'id')::uuid,'friend:invite'); END IF;
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
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',p_id,'friend:resend'); END IF;
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
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification('subscription',p_id,'poll:resend'); END IF;
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
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification('base',p_task_id,'base:share'); END IF;
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
 IF result->>'ok'='true' THEN FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP PERFORM public._mail_allocate_notification('poll',(item->>'task_id')::uuid,'poll:share'); END LOOP; END IF;
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
 IF result->>'ok'='true' THEN FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP PERFORM public._mail_allocate_notification('poll',(item->>'task_id')::uuid,'poll:share'); END LOOP; END IF;
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
 IF result->>'ok'='true' THEN IF result->>'created'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification('device',(result->>'share_id')::uuid,'device:share'); END IF; END IF;
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
   PERFORM public._mail_allocate_notification('base',source_id,'base:share');
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

-- Consolidated source: draft-mail-notification-bind-361.sql
CREATE OR REPLACE FUNCTION public._mail_notification_source_lock(q public.mail_queue)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE before_info jsonb; after_info jsonb; ids uuid[]; mails text[]; mailbox text; f public.friendships; s public.poll_subscriptions;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_info:=public._mail_notification_source_info(q);
   IF before_info IS NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
   SELECT * INTO f FROM public.friendships WHERE id=(before_info->>'friendship_id')::uuid;
   SELECT * INTO s FROM public.poll_subscriptions WHERE id=(before_info->>'subscription_id')::uuid;
   SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(ARRAY[q.created_by,(before_info->>'owner_id')::uuid,(before_info->>'recipient_id')::uuid,
     public._poll_registered_uid(before_info->>'email'),f.requester_id,f.addressee_id,s.owner_id,s.registered_user_id,s.subscriber_user_id]) AS roots(id) WHERE id IS NOT NULL;
   PERFORM 1 FROM auth.users WHERE id=ANY(ids) ORDER BY id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.profiles WHERE id=ANY(ids) ORDER BY id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.user_flags WHERE user_id=ANY(ids) ORDER BY user_id FOR SHARE NOWAIT;
   SELECT array_agg(DISTINCT mail ORDER BY mail) INTO mails FROM unnest(ARRAY[public._norm_email(q.to_email),public._norm_email(before_info->>'email'),public._norm_email(s.subscriber_email)]) AS roots(mail) WHERE mail IS NOT NULL;
   FOREACH mailbox IN ARRAY coalesce(mails,'{}'::text[]) LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||mailbox,351)) THEN RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03'; END IF;
   END LOOP;
   PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=ANY(mails) ORDER BY email FOR SHARE NOWAIT;
   IF f.id IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329)) THEN RAISE EXCEPTION 'friend pair busy' USING ERRCODE='55P03'; END IF;
   IF s.id IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(s.owner_id::text||':email:'||public._norm_email(s.subscriber_email),333)) THEN RAISE EXCEPTION 'subscriber pair busy' USING ERRCODE='55P03'; END IF;
   PERFORM 1 FROM public.games WHERE id=(before_info->>'game_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.question_bases WHERE id=(before_info->>'base_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.control_runtime_sessions WHERE id=(before_info->>'session_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.poll_subscriptions WHERE id=s.id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.friendships WHERE id=f.id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.poll_tasks WHERE id=q.notification_poll_task_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.base_share_tasks WHERE id=q.notification_base_task_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.control_device_shares WHERE id=q.notification_device_share_id FOR SHARE NOWAIT;
   after_info:=public._mail_notification_source_info(q);
   IF before_info IS DISTINCT FROM after_info THEN RAISE EXCEPTION 'source parents changed' USING ERRCODE='55P03'; END IF;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mail_queue_notification_source_bind()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb; allocation public.mail_notification_allocations; source_id uuid;
BEGIN
 IF NEW.cooldown_action_key !~ '^(friend|poll|base|device):' THEN
  IF NEW.created_by IS NOT NULL OR NEW.notification_source_kind IS NOT NULL OR NEW.notification_source_token IS NOT NULL OR NEW.notification_allocation_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.created_by IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.created_by)
  OR NEW.notification_source_token IS NULL OR NOT public._mail_notification_action_matches(NEW.notification_source_kind,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 NEW.notification_friendship_id:=NULL;NEW.notification_subscription_id:=NULL;NEW.notification_poll_task_id:=NULL;NEW.notification_base_task_id:=NULL;NEW.notification_device_share_id:=NULL;
 CASE NEW.notification_source_kind
  WHEN 'friend' THEN SELECT id INTO NEW.notification_friendship_id FROM public.friendships WHERE token=NEW.notification_source_token;
  WHEN 'subscription' THEN SELECT id INTO NEW.notification_subscription_id FROM public.poll_subscriptions WHERE token=NEW.notification_source_token;
  WHEN 'poll' THEN SELECT id INTO NEW.notification_poll_task_id FROM public.poll_tasks WHERE token=NEW.notification_source_token;
  WHEN 'base' THEN SELECT id INTO NEW.notification_base_task_id FROM public.base_share_tasks WHERE token=NEW.notification_source_token;
  WHEN 'device' THEN SELECT id INTO NEW.notification_device_share_id FROM public.control_device_shares WHERE token=NEW.notification_source_token;
 END CASE;
 info:=public._mail_notification_source_info(NEW);
 IF info IS NULL OR (info->>'owner_id')::uuid IS DISTINCT FROM NEW.created_by OR info->>'email' IS DISTINCT FROM public._norm_email(NEW.to_email) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
 PERFORM public._mail_notification_source_lock(NEW);
 -- Existing cooldown/event writers can start from a child. Never wait on them
 -- while holding identity/source roots; release this subtransaction and retry.
 PERFORM 1 FROM public.mail_cooldowns WHERE action_key='baseline:recipient'
  AND target_key='pair:'||NEW.created_by::text||':'||md5(lower(trim(NEW.to_email))) FOR UPDATE NOWAIT;
 IF NEW.cooldown_action_key='poll:share' THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-mail-budget:'||NEW.created_by||':'||public._norm_email(NEW.to_email),342)) THEN
   RAISE EXCEPTION 'poll mail budget busy' USING ERRCODE='55P03';
  END IF;
  PERFORM 1 FROM public.poll_mail_budget_events WHERE owner_id=NEW.created_by
   AND recipient_key=md5(public._norm_email(NEW.to_email)) FOR UPDATE NOWAIT;
 END IF;
 info:=public._mail_notification_source_info(NEW);
 NEW.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(NEW.to_email));
 IF NEW.notification_source_kind='device' AND (NEW.meta#>>'{notification_reference,device_type}' IS DISTINCT FROM info#>>'{snapshot,device_type}'
  OR NEW.meta#>>'{notification_reference,game_id}' IS DISTINCT FROM info#>>'{snapshot,game_id}') THEN RAISE EXCEPTION 'invalid_notification_reference'; END IF;
 IF NOT public._mail_notification_source_live(NEW) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 SELECT * INTO allocation FROM public.mail_notification_allocations a
  WHERE a.owner_id=NEW.created_by AND a.to_email=public._norm_email(NEW.to_email)
   AND a.source_kind=NEW.notification_source_kind AND a.source_token=NEW.notification_source_token
   AND a.friendship_id IS NOT DISTINCT FROM NEW.notification_friendship_id
   AND a.subscription_id IS NOT DISTINCT FROM NEW.notification_subscription_id
   AND a.poll_task_id IS NOT DISTINCT FROM NEW.notification_poll_task_id
   AND a.base_task_id IS NOT DISTINCT FROM NEW.notification_base_task_id
   AND a.device_share_id IS NOT DISTINCT FROM NEW.notification_device_share_id
   AND a.snapshot=NEW.notification_snapshot AND a.consumed_at IS NULL AND a.revoked_at IS NULL AND a.enqueue_before>clock_timestamp()
  ORDER BY a.created_at DESC,a.id LIMIT 1 FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_notification_attempt'; END IF;
 UPDATE public.mail_notification_allocations SET consumed_at=clock_timestamp(),consumed_queue_id=NEW.id WHERE id=allocation.id;
 NEW.notification_allocation_id:=allocation.id;
 RETURN NEW;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_source_lock(public.mail_queue),public.mail_queue_notification_source_bind() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_mail_queue_002_notification_source_bind BEFORE INSERT ON public.mail_queue
 FOR EACH ROW EXECUTE FUNCTION public.mail_queue_notification_source_bind();

-- Consolidated source: draft-mail-notification-revocation-361.sql
-- These triggers only invalidate notification allocations. Auth mail is direct
-- and has no allocation, queue entry or notification preference dependency.
CREATE OR REPLACE FUNCTION public._mail_notification_fields(p_row jsonb,p_fields text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_object_agg(k,p_row->k),'{}'::jsonb) FROM unnest(p_fields) k;
$$;
CREATE OR REPLACE FUNCTION public.mail_notification_source_epoch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE old_row jsonb:=to_jsonb(OLD); new_row jsonb:=to_jsonb(NEW); fields text[];
 kind text; revoke_own boolean; revoke_children boolean:=false; old_status text; new_status text;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'friendships' THEN
  kind:='friend'; fields:=ARRAY['requester_id','addressee_id','decision_user_id','token','source_subscription_id','cancelled_at','declined_at'];
  revoke_children:=NEW.status<>'active' OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL
   OR public._mail_notification_fields(old_row,fields) IS DISTINCT FROM public._mail_notification_fields(new_row,fields);
 WHEN 'poll_subscriptions' THEN
  kind:='subscription';fields:=ARRAY['owner_id','subscriber_email','subscriber_user_id','registered_user_id','token','cancelled_at','declined_at'];
  revoke_children:=NEW.status NOT IN('pending','active') OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL
   OR public._mail_notification_fields(old_row,fields) IS DISTINCT FROM public._mail_notification_fields(new_row,fields);
 WHEN 'poll_tasks' THEN
  kind:='poll';fields:=ARRAY['owner_id','recipient_user_id','recipient_email','token','game_id','share_key_poll','poll_type','source_kind','source_friendship_id','source_subscription_id','cancelled_at','declined_at'];
 WHEN 'base_share_tasks' THEN
  kind:='base';fields:=ARRAY['owner_id','recipient_user_id','token','base_id','role','source_kind','source_friendship_id','cancelled_at','declined_at'];
 WHEN 'control_device_shares' THEN
  kind:='device';fields:=ARRAY['owner_id','recipient_id','recipient_email','token','game_id','session_id','device_type','revoked_at'];
 END CASE;
 old_status:=old_row->>'status';new_status:=new_row->>'status';
 -- Opening an invitation does not consume or invalidate a notification.
 IF kind IN('poll','base') THEN
  IF old_status IN('pending','opened') THEN old_status:='live'; END IF;
  IF new_status IN('pending','opened') THEN new_status:='live'; END IF;
 END IF;
 revoke_own:=old_status IS DISTINCT FROM new_status
  OR public._mail_notification_fields(old_row,fields) IS DISTINCT FROM public._mail_notification_fields(new_row,fields);
 IF revoke_own THEN
  UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp()
   WHERE a.source_kind=kind AND a.source_token=(old_row->>'token')::uuid AND a.revoked_at IS NULL;
 END IF;
 IF revoke_children AND kind='friend' THEN
  UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL AND (
   EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.source_friendship_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.id=a.base_task_id AND t.source_friendship_id=OLD.id));
 ELSIF revoke_children AND kind='subscription' THEN
  UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL AND (
   EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.source_subscription_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=a.friendship_id AND f.source_subscription_id=OLD.id));
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.mail_notification_parent_epoch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE old_row jsonb:=to_jsonb(OLD); new_row jsonb:=to_jsonb(NEW);
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'games' THEN
  IF public._mail_notification_fields(old_row,ARRAY['owner_id','type','status','share_key_poll'])
   IS DISTINCT FROM public._mail_notification_fields(new_row,ARRAY['owner_id','type','status','share_key_poll']) THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.game_id=OLD.id);
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.control_device_shares s WHERE s.id=a.device_share_id AND s.game_id=OLD.id);
  END IF;
 WHEN 'question_bases' THEN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.id=a.base_task_id AND t.base_id=OLD.id);
  END IF;
 WHEN 'control_runtime_sessions' THEN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.ended_at IS NOT NULL
    OR NEW.expires_at<=clock_timestamp() OR NEW.last_activity_at<=clock_timestamp()-interval '1 hour' THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.control_device_shares s WHERE s.id=a.device_share_id AND s.session_id=OLD.id);
  END IF;
 WHEN 'profiles' THEN
  IF NEW.is_guest IS DISTINCT FROM OLD.is_guest THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
    AND (owner_id=NEW.id OR recipient_id=NEW.id OR identity_id=NEW.id);
  END IF;
 WHEN 'user_flags' THEN
  IF NEW.email_notifications IS FALSE THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
    AND (recipient_id=NEW.user_id OR identity_id=NEW.user_id OR to_email=(SELECT public._norm_email(u.email) FROM auth.users u WHERE u.id=NEW.user_id));
  END IF;
 WHEN 'email_unsub_tokens' THEN
  IF TG_OP='UPDATE' AND public._norm_email(NEW.email) IS DISTINCT FROM public._norm_email(OLD.email) THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
    WHERE revoked_at IS NULL AND to_email=public._norm_email(OLD.email);
  END IF;
  IF NEW.suppressed_at IS NOT NULL THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
    WHERE revoked_at IS NULL AND to_email=public._norm_email(NEW.email);
  END IF;
 WHEN 'users' THEN
  IF public._norm_email(NEW.email) IS DISTINCT FROM public._norm_email(OLD.email)
    OR public._poll_identity_regular(NEW.id,to_jsonb(NEW)) IS DISTINCT FROM public._poll_identity_regular(OLD.id,to_jsonb(OLD)) THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL AND (
    recipient_id=OLD.id OR identity_id=OLD.id OR to_email IN(public._norm_email(OLD.email),public._norm_email(NEW.email))
    OR (owner_id=OLD.id AND NOT public._poll_identity_regular(NEW.id,to_jsonb(NEW))));
  END IF;
 END CASE;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_fields(jsonb,text[]),public.mail_notification_source_epoch(),public.mail_notification_parent_epoch() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['friendships','poll_subscriptions','poll_tasks','base_share_tasks','control_device_shares'] LOOP
  EXECUTE format('CREATE TRIGGER trg_notification_source_epoch AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mail_notification_source_epoch()',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['games','question_bases','control_runtime_sessions'] LOOP
  EXECUTE format('CREATE TRIGGER trg_notification_parent_epoch AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch()',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['user_flags','email_unsub_tokens'] LOOP
  EXECUTE format('CREATE TRIGGER trg_notification_parent_epoch AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch()',table_name);
 END LOOP;
END $$;
CREATE TRIGGER trg_notification_auth_epoch AFTER UPDATE OF email,is_anonymous,email_confirmed_at,raw_user_meta_data ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch();

CREATE TRIGGER trg_notification_profile_epoch AFTER UPDATE OF is_guest ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch();

CREATE OR REPLACE FUNCTION public.mail_notification_cancel_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
  -- Keep the consumed allocation ledger: deleting the pending queue entry
  -- never creates a new right to send. Active provider attempts retain their lease.
  DELETE FROM public.mail_queue WHERE notification_allocation_id=NEW.id AND status='pending';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mail_notification_cancel_pending() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_notification_cancel_pending AFTER UPDATE OF revoked_at ON public.mail_notification_allocations
 FOR EACH ROW EXECUTE FUNCTION public.mail_notification_cancel_pending();

-- Consolidated source: draft-mail-notification-delivery-361.sql
CREATE OR REPLACE FUNCTION public._mail_notification_queue_live(q public.mail_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF q.cooldown_action_key ~ '^(friend|poll|base|device):' THEN
  RETURN public._mail_notification_source_live(q) AND EXISTS(
   SELECT 1 FROM public.mail_notification_allocations a WHERE a.id=q.notification_allocation_id
    AND a.consumed_queue_id=q.id AND a.consumed_at IS NOT NULL AND a.revoked_at IS NULL
    AND a.owner_id=q.created_by AND a.to_email=public._norm_email(q.to_email)
    AND a.source_kind=q.notification_source_kind AND a.source_token=q.notification_source_token
    AND a.snapshot=q.notification_snapshot
    AND a.friendship_id IS NOT DISTINCT FROM q.notification_friendship_id
    AND a.subscription_id IS NOT DISTINCT FROM q.notification_subscription_id
    AND a.poll_task_id IS NOT DISTINCT FROM q.notification_poll_task_id
    AND a.base_task_id IS NOT DISTINCT FROM q.notification_base_task_id
    AND a.device_share_id IS NOT DISTINCT FROM q.notification_device_share_id);
 END IF;
 IF q.created_by IS NOT NULL OR q.notification_source_kind IS NOT NULL OR q.notification_allocation_id IS NOT NULL THEN RETURN false; END IF;
 IF q.cooldown_action_key='mail:center_verify' THEN
  RETURN public._mail_center_verification_live(q.mail_center_link_id,q.to_email);
 END IF;
 IF q.contact_source_expected OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id IS NOT NULL THEN
  RETURN public._mail_contact_source_live(q.contact_message_id,q.to_email,q.cooldown_action_key);
 END IF;
 RETURN public._contact_mail_enabled(q.to_email);
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_queue_live(public.mail_queue) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mail_queue_delivery_context(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; initial public.mail_queue; link public.mail_center_links;
 root_id uuid; issued jsonb; current_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT * INTO initial FROM public.mail_queue WHERE id=p_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF initial.notification_source_kind IS NOT NULL THEN
    IF public._mail_notification_source_info(initial) IS NULL THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
    END IF;
    PERFORM public._mail_notification_source_lock(initial);
   END IF;
   PERFORM public._mail_center_identity_lock(public._norm_email(initial.to_email));
   current_uid:=public._poll_registered_uid(initial.to_email);
   PERFORM 1 FROM public.user_flags WHERE user_id=current_uid FOR SHARE NOWAIT;
   IF initial.cooldown_action_key='mail:center_verify' THEN
    SELECT * INTO link FROM public.mail_center_links WHERE id=initial.mail_center_link_id FOR SHARE NOWAIT;
   ELSE
    IF initial.contact_message_id IS NOT NULL THEN
     PERFORM 1 FROM public.reports WHERE id=(SELECT report_id FROM public.messages WHERE id=initial.contact_message_id) FOR SHARE NOWAIT;
     PERFORM 1 FROM public.messages WHERE id=initial.contact_message_id FOR SHARE NOWAIT;
    END IF;
    root_id:=public._ensure_unsub_token(initial.to_email);
    PERFORM 1 FROM public.email_unsub_tokens WHERE token=root_id FOR SHARE NOWAIT;
   END IF;
   PERFORM 1 FROM public.mail_notification_allocations WHERE id=initial.notification_allocation_id FOR SHARE NOWAIT;
   SELECT * INTO q FROM public.mail_queue WHERE id=p_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF public._mail_notification_fields(to_jsonb(q),ARRAY['notification_source_kind','notification_source_token','notification_friendship_id','notification_subscription_id','notification_poll_task_id','notification_base_task_id','notification_device_share_id','notification_snapshot','notification_allocation_id','created_by'])
     IS DISTINCT FROM public._mail_notification_fields(to_jsonb(initial),ARRAY['notification_source_kind','notification_source_token','notification_friendship_id','notification_subscription_id','notification_poll_task_id','notification_base_task_id','notification_device_share_id','notification_snapshot','notification_allocation_id','created_by'])
    OR public._norm_email(q.to_email) IS DISTINCT FROM public._norm_email(initial.to_email)
    OR q.cooldown_action_key IS DISTINCT FROM initial.cooldown_action_key
    OR q.mail_center_link_id IS DISTINCT FROM initial.mail_center_link_id
    OR q.contact_message_id IS DISTINCT FROM initial.contact_message_id
    OR q.contact_source_expected IS DISTINCT FROM initial.contact_source_expected THEN
     RAISE EXCEPTION 'delivery source changed' USING ERRCODE='55P03';
   END IF;
   IF q.status<>'sending' THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_not_claimed'); END IF;
   IF q.cooldown_action_key ~ '^(friend|poll|base|device):' AND NOT public._mail_notification_queue_live(q) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
   END IF;
   IF q.cooldown_action_key='mail:center_verify' THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_center_verification_live(q.mail_center_link_id,q.to_email) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_verification_closed');
    END IF;
    -- Global mail-off is intentionally bypassed only for this private proof.
    RETURN jsonb_build_object('ok',true,'allowed',true,'verification',true,'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
   END IF;
   IF q.contact_source_expected OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id IS NOT NULL THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_contact_source_live(q.contact_message_id,q.to_email,q.cooldown_action_key) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_contact_closed');
    END IF;
   ELSIF NOT public._contact_mail_enabled(q.to_email) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_preference');
   END IF;
   issued:=public.mail_center_issue_link(q.to_email,'footer');
   IF issued->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'delivery footer unavailable'; END IF;
   -- The full capability is returned only to delivery; never write it to q.html.
   RETURN jsonb_build_object('ok',true,'allowed',true,'verification',false,'footer_token',issued->>'token',
     'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  WHEN raise_exception THEN
   IF SQLERRM<>'invalid_notification_source' THEN RAISE; END IF;
   RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mail_queue_delivery_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_queue_delivery_context(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.mail_queue_pick(p_limit integer)
RETURNS SETOF public.mail_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE q.status='pending' AND q.not_before<=now()
   AND public._mail_notification_queue_live(q)
  ORDER BY q.created_at,q.id LIMIT greatest(1,least(coalesce(p_limit,25),200)) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='sending',attempts=q.attempts+1,picked_at=now(),last_attempt_at=now()
 FROM candidates c WHERE q.id=c.id RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.mail_queue_pick_selected(p_ids uuid[],p_limit integer DEFAULT 25)
RETURNS SETOF public.mail_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE q.id=ANY(p_ids) AND q.status='pending' AND q.not_before<=now()
   AND public._mail_notification_queue_live(q)
  ORDER BY array_position(p_ids,q.id),q.created_at LIMIT greatest(1,least(coalesce(p_limit,25),200)) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='sending',attempts=q.attempts+1,picked_at=now(),last_attempt_at=now()
 FROM candidates c WHERE q.id=c.id RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.mail_queue_requeue(p_ids uuid[] DEFAULT NULL,p_only_failed boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE affected integer;
BEGIN
 -- Active sending leases are never reset by a bulk retry. Retain future delay.
 WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE (p_ids IS NULL OR q.id=ANY(p_ids))
   AND (q.status='failed' OR (NOT p_only_failed AND q.status='pending'))
   AND public._mail_notification_queue_live(q) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='pending',not_before=greatest(q.not_before,now()),picked_at=NULL,last_error=NULL,provider_used=NULL
 FROM candidates c WHERE q.id=c.id;
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;

COMMIT;
