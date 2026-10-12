BEGIN;
DO $$
DECLARE issued jsonb; exchanged jsonb; secret text; tok text; rid uuid; sid text; registered jsonb;
BEGIN
 FOR secret IN SELECT unnest(ARRAY['', 'old-u-token', repeat('a',64)]) LOOP
  IF public.mail_center_exchange_link_prototype(secret)->>'ok'='true' THEN RAISE EXCEPTION 'invalid or old token accepted'; END IF;
 END LOOP;
 IF public.mail_center_issue_link_prototype(NULL,'footer')->>'ok'='true' OR public.mail_center_issue_link_prototype('address360@example.invalid','invalid')->>'ok'='true' THEN RAISE EXCEPTION 'invalid issuance accepted'; END IF;
 issued:=public.mail_center_issue_link_prototype(' ADDRESS360@EXAMPLE.INVALID ','footer'); tok:=issued->>'token'; rid:=(issued->>'link_id')::uuid;
 IF tok !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM public.mail_center_links_prototype WHERE id=rid AND token_hash<>tok AND email='address360@example.invalid') THEN RAISE EXCEPTION 'raw token persisted or email mismatch'; END IF;
 exchanged:=public.mail_center_exchange_link_prototype(tok); secret:=exchanged->>'session_secret';
 IF exchanged->>'ok' IS DISTINCT FROM 'true' OR public._mail_center_scope_prototype(secret)->>'email' IS DISTINCT FROM 'address360@example.invalid' THEN RAISE EXCEPTION 'footer exchange/scope failed'; END IF;
 IF public.mail_center_exchange_link_prototype(tok)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'footer not reusable'; END IF;
 IF public._mail_center_scope_prototype(tok)->>'ok'='true' OR public.mail_center_exchange_link_prototype(secret)->>'ok'='true' THEN RAISE EXCEPTION 'link/session secret confused'; END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email='address360@example.invalid';
 IF public._mail_center_scope_prototype(secret)->>'notifications_enabled' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'root suppression ignored'; END IF;
 UPDATE public.mail_center_sessions_prototype SET last_seen_at=clock_timestamp()-interval '2 hours';
 IF public._mail_center_scope_prototype(secret)->>'error' IS DISTINCT FROM 'expired_session' THEN RAISE EXCEPTION 'idle session remained active'; END IF;
 UPDATE public.mail_center_links_prototype SET expires_at=clock_timestamp()-interval '1 second' WHERE id=rid;
 IF public.mail_center_exchange_link_prototype(tok)->>'error' IS DISTINCT FROM 'expired_token' THEN RAISE EXCEPTION 'expired footer accepted'; END IF;
 issued:=public.mail_center_issue_link_prototype('address360@example.invalid','verification'); tok:=issued->>'token'; rid:=(issued->>'link_id')::uuid;
 exchanged:=public.mail_center_exchange_link_prototype(tok); secret:=exchanged->>'session_secret';
 IF exchanged->>'ok' IS DISTINCT FROM 'true' OR public.mail_center_exchange_link_prototype(tok)->>'error' IS DISTINCT FROM 'expired_token' THEN RAISE EXCEPTION 'verification not single use'; END IF;
 UPDATE public.mail_center_links_prototype SET expires_at=clock_timestamp()-interval '1 second' WHERE id=rid;
 IF public._mail_center_scope_prototype(secret)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'verified session inherited short verification TTL'; END IF;
 UPDATE public.mail_center_sessions_prototype SET expires_at=clock_timestamp()-interval '1 second' WHERE link_id=rid;
 IF public._mail_center_scope_prototype(secret)->>'error' IS DISTINCT FROM 'expired_session' THEN RAISE EXCEPTION 'absolute session expiry ignored'; END IF;
 issued:=public.mail_center_issue_link_prototype('registration360@example.invalid','footer'); tok:=issued->>'token';
 exchanged:=public.mail_center_exchange_link_prototype(tok); secret:=exchanged->>'session_secret';
 INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES('aaaaaaaa-3600-0000-0000-000000000001','registration360@example.invalid',false,now(),'{"username":"registration360"}');
 IF public._mail_center_scope_prototype(secret)->>'ok'='true' OR public.mail_center_exchange_link_prototype(tok)->>'ok'='true' THEN RAISE EXCEPTION 'registration retained anonymous capability'; END IF;
 registered:=public.mail_center_issue_link_prototype('registration360@example.invalid','footer');
 IF public.mail_center_exchange_link_prototype(registered->>'token')->>'error' IS DISTINCT FROM 'requires_login' OR public.mail_center_issue_link_prototype('registration360@example.invalid','verification')->>'error' IS DISTINCT FROM 'requires_login' THEN RAISE EXCEPTION 'registered receiver bypassed login'; END IF;
 UPDATE auth.users SET email='new360@example.invalid' WHERE id='aaaaaaaa-3600-0000-0000-000000000001';
 IF public.mail_center_exchange_link_prototype(registered->>'token')->>'ok'='true' OR public._mail_center_scope_prototype(secret)->>'ok'='true' THEN RAISE EXCEPTION 'email change resurrected old capability'; END IF;
 DELETE FROM auth.users WHERE id='aaaaaaaa-3600-0000-0000-000000000001';
 IF public.mail_center_exchange_link_prototype(tok)->>'ok'='true' THEN RAISE EXCEPTION 'account deletion resurrected anonymous capability'; END IF;
 issued:=public.mail_center_issue_link_prototype('cascade360@example.invalid','footer'); tok:=issued->>'token';
 exchanged:=public.mail_center_exchange_link_prototype(tok); secret:=exchanged->>'session_secret';
 DELETE FROM public.email_unsub_tokens WHERE email='cascade360@example.invalid';
 IF public.mail_center_exchange_link_prototype(tok)->>'ok'='true' OR public._mail_center_scope_prototype(secret)->>'ok'='true' THEN RAISE EXCEPTION 'root delete left live capabilities'; END IF;
 FOR secret IN SELECT unnest(ARRAY['public','anon','authenticated']) LOOP
  IF has_function_privilege(secret,'public.mail_center_issue_link_prototype(text,text)','EXECUTE')
   OR has_function_privilege(secret,'public.mail_center_exchange_link_prototype(text)','EXECUTE')
   OR has_function_privilege(secret,'public._mail_center_scope_prototype(text,boolean)','EXECUTE')
   OR has_table_privilege(secret,'public.mail_center_links_prototype','SELECT')
   OR has_table_privilege(secret,'public.mail_center_sessions_prototype','SELECT') THEN RAISE EXCEPTION 'sender/anonymous gained capability access: %',secret; END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role','public.mail_center_issue_link_prototype(text,text)','EXECUTE') THEN RAISE EXCEPTION 'service role cannot issue'; END IF;
 RAISE NOTICE '360 local capability contract passed';
END $$;
ROLLBACK;
