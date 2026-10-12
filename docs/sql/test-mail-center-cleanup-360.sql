BEGIN;
DO $$ DECLARE issued jsonb; live_id uuid; short_id uuid; expired_id uuid; secret text; result jsonb; BEGIN
 issued:=public.mail_center_issue_link_prototype('cleanup360@example.invalid','footer');live_id:=(issued->>'link_id')::uuid;
 secret:=public.mail_center_exchange_link_prototype(issued->>'token')->>'session_secret';
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email='cleanup360@example.invalid';
 issued:=public.mail_center_issue_link_prototype('shortcleanup360@example.invalid','verification');short_id:=(issued->>'link_id')::uuid;
 secret:=public.mail_center_exchange_link_prototype(issued->>'token')->>'session_secret';
 UPDATE public.mail_center_links_prototype SET expires_at=now()-interval '1 second' WHERE id=short_id;
 issued:=public.mail_center_issue_link_prototype('expiredcleanup360@example.invalid','footer');expired_id:=(issued->>'link_id')::uuid;
 UPDATE public.mail_center_links_prototype SET expires_at=now()-interval '1 second' WHERE id=expired_id;
 INSERT INTO public.mail_center_request_events_prototype(email_hash,ip_hash,created_at) VALUES(repeat('a',64),repeat('b',64),now()-interval '3 days'),(repeat('c',64),repeat('d',64),now());
 result:=public.mail_center_cleanup_prototype();
 IF NOT EXISTS(SELECT 1 FROM public.mail_center_links_prototype WHERE id=live_id)
  OR EXISTS(SELECT 1 FROM public.mail_center_links_prototype WHERE id=expired_id)
  OR NOT EXISTS(SELECT 1 FROM public.mail_center_links_prototype WHERE id=short_id)
  OR public._mail_center_scope_prototype(secret)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'cleanup expired live verification session or retained expired footer'; END IF;
 IF EXISTS(SELECT 1 FROM public.mail_center_request_events_prototype WHERE email_hash=repeat('a',64))
  OR NOT EXISTS(SELECT 1 FROM public.mail_center_request_events_prototype WHERE email_hash=repeat('c',64)) THEN RAISE EXCEPTION 'request history retention failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.email_unsub_tokens WHERE email='cleanup360@example.invalid' AND suppressed_at IS NOT NULL) THEN RAISE EXCEPTION 'cleanup lifted global preference'; END IF;
 UPDATE public.mail_center_sessions_prototype SET last_seen_at=now()-interval '2 hours' WHERE link_id=short_id;
 result:=public.mail_center_cleanup_prototype();
 IF EXISTS(SELECT 1 FROM public.mail_center_links_prototype WHERE id=short_id) OR EXISTS(SELECT 1 FROM public.mail_center_sessions_prototype WHERE link_id=short_id) THEN RAISE EXCEPTION 'idle source/session remained'; END IF;
 UPDATE public.mail_center_links_prototype SET revoked_at=now() WHERE id=live_id;
 result:=public.mail_center_cleanup_prototype();
 IF EXISTS(SELECT 1 FROM public.mail_center_links_prototype WHERE id=live_id) OR EXISTS(SELECT 1 FROM public.mail_center_sessions_prototype WHERE link_id=live_id) THEN RAISE EXCEPTION 'revoked tree remained'; END IF;
 IF has_function_privilege('anon','public.mail_center_cleanup_prototype()','EXECUTE') OR has_function_privilege('authenticated','public.mail_center_cleanup_prototype()','EXECUTE') THEN RAISE EXCEPTION 'public cleanup allowed'; END IF;
 RAISE NOTICE 'cleanup idle/absolute/link expiry, live verification session, revoked tree, request retention and root preservation passed';
END $$;
ROLLBACK;
