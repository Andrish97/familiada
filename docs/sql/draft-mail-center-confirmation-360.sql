-- LOCAL DRAFT: user-requested confirmation has a private, live source.
ALTER TABLE public.mail_queue ADD COLUMN mail_center_link_id_prototype uuid
 REFERENCES public.mail_center_links_prototype(id) ON DELETE SET NULL;
CREATE TABLE public.mail_center_request_events_prototype(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email_hash text NOT NULL, ip_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.mail_center_request_events_prototype(email_hash,created_at);
CREATE INDEX ON public.mail_center_request_events_prototype(ip_hash,created_at);
ALTER TABLE public.mail_center_request_events_prototype ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_center_request_events_prototype FROM PUBLIC,anon,authenticated;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
 VALUES('mail:center_verify','email',60,true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._mail_center_verification_live_prototype(p_link uuid,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.mail_center_links_prototype l JOIN public.email_unsub_tokens r ON r.token=l.root_token
  WHERE l.id=p_link AND l.email=public._norm_email(p_email) AND r.email=l.email AND l.purpose='verification'
   AND l.revoked_at IS NULL AND l.consumed_at IS NULL AND l.expires_at>clock_timestamp())
  AND public._poll_registered_uid(p_email) IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.mail_center_request_link_prototype(p_email text,p_ip_hash text,p_subject text,p_html text,p_lang text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE mailbox text:=public._norm_email(p_email); address_hash text; issued jsonb; queue_id uuid; seconds integer; deadline timestamptz;
BEGIN
 IF mailbox IS NULL OR length(mailbox)>320 OR mailbox !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'
  OR p_ip_hash IS NULL OR p_ip_hash !~ '^[a-f0-9]{64}$' OR p_html IS NULL OR length(p_html)>100000
  OR p_html NOT LIKE '%MAIL_CENTER_ACCESS_TOKEN%' OR p_subject IS NULL OR length(p_subject)>500
  OR p_lang IS NULL OR p_lang NOT IN('pl','en','uk') THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 PERFORM public._mail_center_identity_lock_prototype(mailbox);
 PERFORM pg_advisory_xact_lock(hashtextextended('mail:center-ip:'||p_ip_hash,360));
 address_hash:=encode(sha256(convert_to(mailbox,'UTF8')),'hex');
 IF (SELECT count(*) FROM public.mail_center_request_events_prototype WHERE ip_hash=p_ip_hash AND created_at>clock_timestamp()-interval '15 minutes')>=10 THEN
  RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',900);
 END IF;
 IF public._poll_registered_uid(mailbox) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 seconds:=greatest(60,coalesce((SELECT cooldown_seconds FROM public.mail_cooldown_policies WHERE action_key='baseline:recipient'),60));
 SELECT max(created_at)+make_interval(secs=>seconds) INTO deadline FROM public.mail_center_request_events_prototype WHERE email_hash=address_hash;
 IF deadline>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',ceil(extract(epoch FROM deadline-clock_timestamp()))::integer); END IF;
 IF (SELECT count(*) FROM public.mail_center_request_events_prototype WHERE email_hash=address_hash AND created_at>clock_timestamp()-interval '24 hours')>=10 THEN
  RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',86400);
 END IF;
 issued:=public.mail_center_issue_link_prototype(mailbox,'verification');
 IF issued->>'ok' IS DISTINCT FROM 'true' THEN RETURN issued; END IF;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,text,cooldown_action_key,cooldown_target_key,mail_center_link_id_prototype,meta)
 VALUES(NULL,mailbox,p_subject,replace(p_html,'MAIL_CENTER_ACCESS_TOKEN',issued->>'token'),
  p_subject||' https://www.familiada.online/go/?m='||(issued->>'token'),
  'mail:center_verify','email:'||md5(mailbox),(issued->>'link_id')::uuid,jsonb_build_object('lang',p_lang)) RETURNING id INTO queue_id;
 IF queue_id IS NULL THEN RAISE EXCEPTION 'verification_queue_insert_failed'; END IF;
 INSERT INTO public.mail_center_request_events_prototype(email_hash,ip_hash) VALUES(address_hash,p_ip_hash);
 -- The caller sees no capability, HTML, or source id. Only actual delivery reveals it.
 RETURN jsonb_build_object('ok',true,'cooldown_seconds',seconds);
END $$;
REVOKE ALL ON FUNCTION public._mail_center_verification_live_prototype(uuid,text),public.mail_center_request_link_prototype(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_center_request_link_prototype(text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION "public"."mail_queue_notification_preference_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_notifications_enabled boolean;
BEGIN
  IF NEW.cooldown_action_key='mail:center_verify' THEN
    IF NEW.created_by IS NOT NULL OR NEW.mail_center_link_id_prototype IS NULL
      OR NOT public._mail_center_verification_live_prototype(NEW.mail_center_link_id_prototype,NEW.to_email) THEN
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
