-- LOCAL PROTOTYPE ONLY: service-only capabilities, never upgrade sender-visible u tokens.
CREATE TABLE public.mail_center_links_prototype (
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
CREATE INDEX ON public.mail_center_links_prototype(email) WHERE revoked_at IS NULL;
CREATE TABLE public.mail_center_sessions_prototype (
 secret_hash text PRIMARY KEY CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 link_id uuid NOT NULL REFERENCES public.mail_center_links_prototype(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
ALTER TABLE public.mail_center_links_prototype ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_center_sessions_prototype ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_center_links_prototype,public.mail_center_sessions_prototype FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._mail_center_identity_lock_prototype(p_email text)
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

CREATE OR REPLACE FUNCTION public.mail_center_issue_link_prototype(p_email text,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text:=public._norm_email(p_email); secret text; root_id uuid; link_id uuid; deadline timestamptz;
BEGIN
 IF mailbox IS NULL OR length(mailbox)>320 OR mailbox !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_purpose IS NULL OR p_purpose NOT IN('footer','verification') THEN
  RETURN jsonb_build_object('ok',false,'error','invalid_request');
 END IF;
 PERFORM public._mail_center_identity_lock_prototype(mailbox);
 IF p_purpose='verification' AND public._poll_registered_uid(mailbox) IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'error','requires_login');
 END IF;
 root_id:=public._ensure_unsub_token(mailbox);
 secret:=encode(public.gen_random_bytes(32),'hex');
 deadline:=clock_timestamp()+CASE WHEN p_purpose='footer' THEN interval '30 days' ELSE interval '15 minutes' END;
 INSERT INTO public.mail_center_links_prototype(token_hash,email,root_token,purpose,expires_at)
 VALUES(encode(sha256(convert_to(secret,'UTF8')),'hex'),mailbox,root_id,p_purpose,deadline) RETURNING id INTO link_id;
 RETURN jsonb_build_object('ok',true,'token',secret,'expires_at',deadline,'link_id',link_id);
END $$;

CREATE OR REPLACE FUNCTION public.mail_center_exchange_link_prototype(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE link public.mail_center_links_prototype; hashed text; secret text; deadline timestamptz;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 hashed:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 SELECT * INTO link FROM public.mail_center_links_prototype WHERE token_hash=hashed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_center_identity_lock_prototype(link.email);
 SELECT * INTO link FROM public.mail_center_links_prototype WHERE token_hash=hashed FOR UPDATE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL OR link.expires_at<=clock_timestamp()
   OR (link.purpose='verification' AND link.consumed_at IS NOT NULL) THEN
  RETURN jsonb_build_object('ok',false,'error','expired_token');
 END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 IF link.purpose='verification' THEN UPDATE public.mail_center_links_prototype SET consumed_at=clock_timestamp() WHERE id=link.id; END IF;
 secret:=encode(public.gen_random_bytes(32),'hex');
 deadline:=least(clock_timestamp()+interval '24 hours',link.expires_at);
 -- Verification link expiry only limits exchange, not the verified session.
 IF link.purpose='verification' THEN deadline:=clock_timestamp()+interval '24 hours'; END IF;
 INSERT INTO public.mail_center_sessions_prototype(secret_hash,link_id,expires_at)
 VALUES(encode(sha256(convert_to(secret,'UTF8')),'hex'),link.id,deadline);
 RETURN jsonb_build_object('ok',true,'session_secret',secret,'expires_at',deadline);
END $$;

CREATE OR REPLACE FUNCTION public._mail_center_scope_prototype(p_secret text,p_touch boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE sess public.mail_center_sessions_prototype; link public.mail_center_links_prototype; hashed text;
BEGIN
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 hashed:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 SELECT * INTO sess FROM public.mail_center_sessions_prototype WHERE secret_hash=hashed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 SELECT * INTO link FROM public.mail_center_links_prototype WHERE id=sess.link_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','expired_session'); END IF;
 PERFORM public._mail_center_identity_lock_prototype(link.email);
 SELECT * INTO link FROM public.mail_center_links_prototype WHERE id=sess.link_id FOR UPDATE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','expired_session'); END IF;
 SELECT * INTO sess FROM public.mail_center_sessions_prototype WHERE secret_hash=hashed FOR UPDATE;
 IF NOT FOUND OR sess.revoked_at IS NOT NULL OR sess.expires_at<=clock_timestamp()
   OR sess.last_seen_at<=clock_timestamp()-interval '1 hour' THEN
  RETURN jsonb_build_object('ok',false,'error','expired_session');
 END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 IF p_touch THEN UPDATE public.mail_center_sessions_prototype SET last_seen_at=clock_timestamp() WHERE secret_hash=hashed; END IF;
 RETURN jsonb_build_object('ok',true,'email',link.email,'notifications_enabled',public._contact_mail_enabled(link.email));
END $$;

CREATE OR REPLACE FUNCTION public._mail_center_identity_invalidate_prototype()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailboxes text[];
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='INSERT' OR NEW.is_guest IS NOT DISTINCT FROM OLD.is_guest THEN RETURN NEW; END IF;
  SELECT ARRAY[public._norm_email(email)] INTO mailboxes FROM auth.users WHERE id=NEW.id;
 ELSIF TG_OP='UPDATE' THEN
  IF public._norm_email(NEW.email) IS NOT DISTINCT FROM public._norm_email(OLD.email)
   AND NEW.is_anonymous IS NOT DISTINCT FROM OLD.is_anonymous
   AND (NEW.raw_user_meta_data->>'is_guest') IS NOT DISTINCT FROM (OLD.raw_user_meta_data->>'is_guest') THEN RETURN NEW; END IF;
  mailboxes:=ARRAY[public._norm_email(OLD.email),public._norm_email(NEW.email)];
 ELSIF TG_OP='INSERT' THEN
  IF NOT public._poll_identity_regular(NEW.id,to_jsonb(NEW)) THEN RETURN NEW; END IF;
  mailboxes:=ARRAY[public._norm_email(NEW.email)];
 ELSE mailboxes:=ARRAY[public._norm_email(OLD.email)]; END IF;
 PERFORM public._poll_identity_mail_locks(mailboxes);
 UPDATE public.mail_center_links_prototype SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE email=ANY(mailboxes) AND revoked_at IS NULL;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_mail_center_auth_invalidate_prototype AFTER INSERT OR UPDATE OR DELETE ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_identity_invalidate_prototype();
CREATE TRIGGER zz_mail_center_profile_invalidate_prototype AFTER UPDATE OF is_guest ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public._mail_center_identity_invalidate_prototype();
REVOKE ALL ON FUNCTION public._mail_center_identity_lock_prototype(text),public.mail_center_issue_link_prototype(text,text),public.mail_center_exchange_link_prototype(text),public._mail_center_scope_prototype(text,boolean),public._mail_center_identity_invalidate_prototype() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_issue_link_prototype(text,text),public.mail_center_exchange_link_prototype(text),public._mail_center_scope_prototype(text,boolean) TO service_role;
