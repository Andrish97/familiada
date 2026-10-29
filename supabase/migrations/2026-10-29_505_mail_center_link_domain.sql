-- 505: przeprowadzka domeny (rebranding) — link w tekstowej części maila
-- potwierdzenia centrum poczty prowadzi do www.familijna.app. Wdrażać razem
-- z kodem przełączenia domeny (stara domena i tak przekierowuje do 2027-12-31).

CREATE OR REPLACE FUNCTION "public"."mail_center_request_link"("p_email" "text", "p_ip_hash" "text", "p_subject" "text", "p_html" "text", "p_lang" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
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
  p_subject||' https://www.familijna.app/go/?m='||(issued->>'token'),
  'mail:center_verify','email:'||md5(mailbox),(issued->>'link_id')::uuid,jsonb_build_object('lang',p_lang)) RETURNING id INTO queue_id;
 IF queue_id IS NULL THEN RAISE EXCEPTION 'verification_queue_insert_failed'; END IF;
 INSERT INTO public.mail_center_request_events(email_hash,ip_hash) VALUES(address_hash,p_ip_hash);
 -- The caller sees no capability, HTML, or source id. Only actual delivery reveals it.
 RETURN jsonb_build_object('ok',true,'cooldown_seconds',seconds);
END $_$;
