BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('baseline:recipient','pair',60,true) ON CONFLICT DO NOTHING;
DO $$ DECLARE r jsonb; e text:='confirm360@example.invalid'; tok uuid; q public.mail_queue; proof text; BEGIN
 tok:=public._ensure_unsub_token(e);
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE token=tok;
 r:=public.mail_center_request_link_prototype(e,repeat('a',64),'fixture','<a href="https://www.familiada.online/go/?m=MAIL_CENTER_ACCESS_TOKEN">fixture</a>','pl');
 IF r->>'ok' IS DISTINCT FROM 'true' OR r?'token' OR r?'link_id' THEN RAISE EXCEPTION 'request failed or capability returned: %',r; END IF;
 SELECT * INTO q FROM public.mail_queue WHERE to_email=e AND cooldown_action_key='mail:center_verify';
 IF NOT FOUND OR q.created_by IS NOT NULL OR q.mail_center_link_id_prototype IS NULL OR q.html LIKE '%MAIL_CENTER_ACCESS_TOKEN%' THEN RAISE EXCEPTION 'no private verified queue source'; END IF;
 proof:=substring(q.html FROM 'm=([a-f0-9]{64})');
 IF public.mail_center_exchange_link_prototype(proof)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'actual delivered proof invalid'; END IF;
 r:=public.mail_center_request_link_prototype(e,repeat('b',64),'fixture','MAIL_CENTER_ACCESS_TOKEN','pl');
 IF r->>'error' IS DISTINCT FROM 'cooldown' THEN RAISE EXCEPTION 'second IP bypassed email cooldown'; END IF;
 IF (SELECT count(*) FROM public.mail_queue WHERE to_email=e)<>1 THEN RAISE EXCEPTION 'duplicate confirmation queued'; END IF;
 BEGIN
  INSERT INTO public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key) VALUES(e,'spoof','fixture','mail:center_verify','email:spoof');
  RAISE EXCEPTION 'fake confirmation bypassed preference guard';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_verification_source' THEN RAISE; END IF; END;
 INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('aaaaaaaa-3602-0000-0000-000000000001','registeredconfirm360@example.invalid',false,now(),'{"username":"registeredconfirm360"}');
 r:=public.mail_center_request_link_prototype('registeredconfirm360@example.invalid',repeat('a',64),'fixture','MAIL_CENTER_ACCESS_TOKEN','pl');
 IF r->>'error' IS DISTINCT FROM 'requires_login' OR EXISTS(SELECT 1 FROM public.mail_queue WHERE to_email='registeredconfirm360@example.invalid') THEN RAISE EXCEPTION 'registered address got anonymous confirmation'; END IF;
 IF has_function_privilege('anon','public.mail_center_request_link_prototype(text,text,text,text,text)','EXECUTE') OR has_table_privilege('authenticated','public.mail_center_request_events_prototype','SELECT') THEN RAISE EXCEPTION 'request service boundary bypassed'; END IF;
 RAISE NOTICE 'private requested confirmation, global-off exception, source binding, cooldown and account boundary passed';
END $$;
ROLLBACK;
