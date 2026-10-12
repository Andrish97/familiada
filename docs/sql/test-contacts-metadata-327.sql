-- Kontrakt metadanych i bramka przypomnień; wyłącznie rollback, bez wysyłki maila.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('friend:invite','pair',432000,true),('friend:resend','pair',432000,true),
 ('poll:resend','pair',432000,true) ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3270-0000-0000-000000000001','a327@example.net'),
 ('bbbbbbbb-3270-0000-0000-000000000002','b327@example.net'),
 ('cccccccc-3270-0000-0000-000000000003','c327@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3270-0000-0000-000000000001','a327@example.net','fixturea327'),
 ('bbbbbbbb-3270-0000-0000-000000000002','b327@example.net','fixtureb327'),
 ('cccccccc-3270-0000-0000-000000000003','c327@example.net','fixturec327')
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
DO $$
DECLARE a uuid:='aaaaaaaa-3270-0000-0000-000000000001'; b uuid:='bbbbbbbb-3270-0000-0000-000000000002';
 c uuid:='cccccccc-3270-0000-0000-000000000003'; f uuid; tok uuid; r jsonb; ls jsonb; t timestamptz;
BEGIN
 IF has_function_privilege('anon','public.contacts_list(text)','EXECUTE') OR
    NOT has_function_privilege('authenticated','public.contacts_list(text)','EXECUTE') OR
    has_function_privilege('authenticated','public._contact_mail_enabled(text)','EXECUTE') THEN
   RAISE EXCEPTION 'metadata ACL'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.contacts_list('friends')->>'err'<>'auth required' THEN RAISE EXCEPTION 'anonymous'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF public.contacts_list('bad')->>'err'<>'invalid_kind' OR public.contacts_list('friends')<>'[]' THEN
   RAISE EXCEPTION 'invalid kind/empty'; END IF;
 r:=public.friends_invite('fixtureb327'); f:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF NOT coalesce((r->>'ok')::boolean,false) THEN RAISE EXCEPTION 'invite %',r; END IF;
 ls:=public.contacts_list('friends')->0; t:=(ls->>'resend_available_at')::timestamptz;
 IF ls->>'direction'<>'outgoing' OR NOT (ls->>'email_enabled')::boolean OR t<>now()+interval '5 days' THEN
   RAISE EXCEPTION 'outgoing initial cooldown %',ls; END IF;
 r:=public.friends_resend(f);
 IF r->>'err'<>'cooldown' OR (r->>'cooldown_until')::timestamptz<>t THEN RAISE EXCEPTION 'initial resend %',r; END IF;
 IF (SELECT email_send_count FROM public.friendships WHERE id=f)<>1 THEN RAISE EXCEPTION 'blocked increments'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 ls:=public.contacts_list('friends')->0;
 IF ls->>'direction'<>'incoming' OR ls->>'resend_available_at' IS NOT NULL THEN RAISE EXCEPTION 'incoming timer'; END IF;
 IF public.friends_resend(f)->>'err'<>'not_found' THEN RAISE EXCEPTION 'recipient resend'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 IF public.contacts_list('friends')<>'[]' OR public.friends_resend(f)->>'err'<>'not_found' THEN RAISE EXCEPTION 'foreign isolation'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(b,false)
 ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 ls:=public.contacts_list('friends')->0;
 IF (ls->>'email_enabled')::boolean THEN RAISE EXCEPTION 'flag missing'; END IF;
 r:=public.friends_resend(f);
 IF NOT (r->>'ok')::boolean OR (r->>'mail_allowed')::boolean OR r->>'to' IS NOT NULL THEN RAISE EXCEPTION 'disabled resend %',r; END IF;
 IF (SELECT email_send_count FROM public.friendships WHERE id=f)<>1 OR
    EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='friend:resend' AND target_key='pair:'||a||':'||b) THEN
   RAISE EXCEPTION 'disabled resend consumed limit'; END IF;
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=b;
 UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE target_key='pair:'||a||':'||b;
 IF public.contacts_list('friends')->0->>'resend_available_at' IS NOT NULL THEN RAISE EXCEPTION 'expired timer'; END IF;
 r:=public.friends_resend(f);
 IF NOT (r->>'ok')::boolean OR (r->>'token')::uuid<>tok THEN RAISE EXCEPTION 'reminder changed token %',r; END IF;
 ls:=public.contacts_list('friends')->0;
 IF (ls->>'resend_available_at')::timestamptz<>now()+interval '30 days' THEN RAISE EXCEPTION 'mail cap %',ls; END IF;
 IF public.friends_resend(f)->>'reason'<>'mail_limit' THEN RAISE EXCEPTION 'mail cap backend'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 r:=public.friends_accept(f);
 ls:=public.contacts_list('friends')->0;
 IF NOT (r->>'ok')::boolean OR ls->>'direction'<>'friend' OR ls->>'resend_available_at' IS NOT NULL THEN RAISE EXCEPTION 'accepted timer'; END IF;
 IF public.friends_resend(f)->>'ok'<>'false' THEN RAISE EXCEPTION 'active resend'; END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,email_sent_at,email_send_count)
 VALUES(a,'mail327@example.net','pending',now(),1);
 PERFORM public.mail_cooldown_reserve('poll:resend','pair:'||a||':email:'||md5('mail327@example.net'));
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 ls:=public.contacts_list('subscribers')->0;
 IF ls->>'email'<>'mail327@example.net' OR (ls->>'resend_available_at')::timestamptz<>now()+interval '5 days' THEN
   RAISE EXCEPTION 'subscriber timer %',ls; END IF;
 UPDATE public.poll_subscriptions SET email_send_count=2 WHERE owner_id=a;
 IF (public.contacts_list('subscribers')->0->>'resend_available_at')::timestamptz<>now()+interval '30 days' THEN
   RAISE EXCEPTION 'subscriber mail cap'; END IF;
 UPDATE public.poll_subscriptions SET status='active' WHERE owner_id=a;
 IF public.contacts_list('subscribers')->0->>'resend_available_at' IS NOT NULL THEN RAISE EXCEPTION 'active subscriber timer'; END IF;
 DELETE FROM public.profiles WHERE id=a;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.contacts_list('friends')<>'[]' THEN RAISE EXCEPTION 'parent cascade'; END IF;
 RAISE NOTICE '327 OK: ACL/auth/kind/empty/isolation/directions/initial timer/expiry/flag/no side effects/token/mail caps/active/parent cascade';
END $$;
ROLLBACK;
