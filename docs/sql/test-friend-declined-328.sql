-- Trwała odmowa znajomości i przypomnienie bez resetu decyzji; wyłącznie rollback, bez wysyłki maila.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('friend:invite_after_reject','pair',2592000,true),('friend:invite','pair',432000,true),('friend:resend','pair',432000,true),
 ('poll:resend','pair',432000,true) ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3280-0000-0000-000000000001','a328@example.net'),
 ('bbbbbbbb-3280-0000-0000-000000000002','b328@example.net'),
 ('cccccccc-3280-0000-0000-000000000003','c328@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3280-0000-0000-000000000001','a328@example.net','fixturea328'),
 ('bbbbbbbb-3280-0000-0000-000000000002','b328@example.net','fixtureb328'),
 ('cccccccc-3280-0000-0000-000000000003','c328@example.net','fixturec328')
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
DO $$
DECLARE a uuid:='aaaaaaaa-3280-0000-0000-000000000001'; b uuid:='bbbbbbbb-3280-0000-0000-000000000002';
 c uuid:='cccccccc-3280-0000-0000-000000000003'; f uuid; tok uuid; r jsonb; ls jsonb;
BEGIN
 IF has_function_privilege('anon','public.friends_resend(uuid)','EXECUTE') OR
    has_function_privilege('anon','public.friends_reject(uuid)','EXECUTE') OR
    NOT has_function_privilege('authenticated','public.friends_resend(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'friend mutation ACL'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.friends_reject(gen_random_uuid())->>'err' IS DISTINCT FROM 'auth required' THEN
   RAISE EXCEPTION 'reject without auth'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_invite('fixtureb328'); f:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF public.friends_reject(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'requester rejects'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 IF public.friends_reject(f)->>'err' IS DISTINCT FROM 'not_found' OR public.friends_cancel(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'foreign mutation'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 r:=public.friends_reject(f);
 IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'reject %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=f AND token=tok AND status='declined' AND declined_at IS NOT NULL) THEN RAISE EXCEPTION 'reject changed token/lost decision'; END IF;
 IF public.friends_reject(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'repeat reject'; END IF;
 ls:=public.contacts_list('friends')->0;
 IF ls->>'direction' IS DISTINCT FROM 'incoming' OR ls->>'status' IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'recipient decision missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 ls:=public.contacts_list('friends')->0;
 IF ls->>'direction' IS DISTINCT FROM 'outgoing' OR ls->>'status' IS DISTINCT FROM 'declined' OR ls->>'resend_available_at' IS NULL THEN RAISE EXCEPTION 'sender decision/timer missing'; END IF;
 IF public.friends_invite('fixtureb328')->>'err' IS DISTINCT FROM 'already' THEN RAISE EXCEPTION 'duplicate declined'; END IF;
 IF public.friends_resend(f)->>'err' IS DISTINCT FROM 'cooldown' THEN RAISE EXCEPTION 'declined early reminder'; END IF;
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(b,false)
 ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 r:=public.friends_resend(f);
 IF r->>'mail_allowed' IS DISTINCT FROM 'false' OR
    NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=f AND status='declined' AND token=tok AND email_send_count=1) THEN
   RAISE EXCEPTION 'disabled declined reminder changes relation %',r; END IF;
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=b;
 UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second'
 WHERE target_key='pair:'||a||':'||b AND action_key IN ('friend:invite','friend:resend');
 r:=public.friends_resend(f);
 IF NOT (r->>'ok')::boolean OR (r->>'token')::uuid IS DISTINCT FROM tok OR
    NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=f AND status='declined' AND declined_at IS NOT NULL AND email_send_count=2) THEN
   RAISE EXCEPTION 'reminder reset decision/token %',r; END IF;
 IF public.friends_accept(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'sender accepts'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 r:=public.friends_accept(f);
 IF NOT (r->>'ok')::boolean OR NOT public.are_friends(a,b) OR
    (SELECT declined_at IS NOT NULL FROM public.friendships WHERE id=f) THEN RAISE EXCEPTION 'recipient changes decision %',r; END IF;
 IF public.friends_cancel(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'cancel active'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_invite('fixturec328'); f:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 PERFORM public.friends_reject(f);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_cancel(f);
 IF NOT (r->>'ok')::boolean OR EXISTS(SELECT 1 FROM public.friendships WHERE id=f) THEN RAISE EXCEPTION 'cancel declined'; END IF;
 IF public.friends_token_info(tok)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'revoked token'; END IF;
 r:=public.friends_invite('fixturec328');
 IF r->>'reason' IS DISTINCT FROM 'after_reject' THEN RAISE EXCEPTION 'cancel bypasses reject window %',r; END IF;
 DELETE FROM public.mail_cooldowns WHERE target_key='pair:'||a||':'||c;
 r:=public.friends_invite('fixturec328'); f:=(r->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 PERFORM public.friends_reject(f);
 r:=public.friends_invite('fixturea328');
 IF NOT (r->>'accepted')::boolean OR NOT public.are_friends(a,c) OR
    (SELECT declined_at IS NOT NULL FROM public.friendships WHERE id=f) THEN RAISE EXCEPTION 'cross invite changes decision'; END IF;
 DELETE FROM public.profiles WHERE id=a;
 IF EXISTS(SELECT 1 FROM public.friendships WHERE requester_id=a OR addressee_id=a) THEN
   RAISE EXCEPTION 'parent deletion leaves relation'; END IF;
 RAISE NOTICE '328 OK: identity/status preservation/duplicate/cooldown/immutable reminder/explicit acceptance/cancel/revoked token/reject window/cross invite';
END $$;
ROLLBACK;
