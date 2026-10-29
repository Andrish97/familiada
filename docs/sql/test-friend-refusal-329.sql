-- Wyłącznie izolowany Postgres; rollback, bez kolejki i bez dostarczania maili.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('friend:invite_after_reject','pair',2592000,true),('friend:invite','pair',432000,true),('friend:resend','pair',432000,true),('poll:resend','pair',432000,true)
ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3290-0000-0000-000000000001','a329@example.net'),
 ('bbbbbbbb-3290-0000-0000-000000000002','b329@example.net'),
 ('cccccccc-3290-0000-0000-000000000003','c329@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3290-0000-0000-000000000001','a329@example.net','fixturea329'),
 ('bbbbbbbb-3290-0000-0000-000000000002','b329@example.net','fixtureb329'),
 ('cccccccc-3290-0000-0000-000000000003','c329@example.net','fixturec329')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
DO $$
DECLARE a uuid:='aaaaaaaa-3290-0000-0000-000000000001'; b uuid:='bbbbbbbb-3290-0000-0000-000000000002';
 c uuid:='cccccccc-3290-0000-0000-000000000003'; f uuid; tok uuid; r jsonb; stamp timestamptz;
BEGIN
 IF has_function_privilege('anon','public.friends_undo_reject(uuid)','EXECUTE') OR
 NOT has_function_privilege('authenticated','public.friends_undo_reject(uuid)','EXECUTE') THEN RAISE EXCEPTION 'undo ACL'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.friends_undo_reject(gen_random_uuid())->>'err' IS DISTINCT FROM 'auth required' THEN RAISE EXCEPTION 'anonymous undo'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_invite('FIXTUREB329'); f:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'mail_allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'initial invite %',r; END IF;
 r:=public.friends_invite('B329@EXAMPLE.NET');
 IF r->>'status' IS DISTINCT FROM 'pending' OR r->>'direction' IS DISTINCT FROM 'outgoing' THEN RAISE EXCEPTION 'email duplicate %',r; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 r:=public.friends_invite('fixturea329');
 IF r->>'ok' IS DISTINCT FROM 'false' OR r->>'direction' IS DISTINCT FROM 'incoming' OR public.are_friends(a,b) THEN RAISE EXCEPTION 'cross autoaccept %',r; END IF;
 IF public.friends_reject(f)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'reject'; END IF;
 SELECT declined_at INTO stamp FROM public.friendships WHERE id=f;
 IF public.friends_accept(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'accept skipped undo'; END IF;
 IF public.friends_reject(f)->>'err' IS DISTINCT FROM 'not_found' OR
 (SELECT declined_at FROM public.friendships WHERE id=f) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'repeat decline extends window'; END IF;
 IF public.contacts_list('friends')->0->>'decline_expires_at' IS NULL THEN RAISE EXCEPTION 'expiry metadata'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF public.friends_resend(f)->>'err' IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'resend declined'; END IF;
 IF public.friends_undo_reject(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'sender undo'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 IF public.friends_undo_reject(f)->>'err' IS DISTINCT FROM 'not_found' OR public.friends_cancel(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'foreign mutations'; END IF;
 UPDATE public.friendships SET declined_at=now()-interval '5 days' WHERE id=f;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF jsonb_array_length(public.contacts_list('friends'))<>0 THEN RAISE EXCEPTION 'sender hide boundary'; END IF;
 r:=public.friends_invite('fixtureb329');
 IF r->>'status' IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'hidden refusal bypass %',r; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF jsonb_array_length(public.contacts_list('friends'))<>1 THEN RAISE EXCEPTION 'recipient refusal hidden'; END IF;
 r:=public.friends_undo_reject(f);
 IF r->>'ok' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=f AND token=tok AND status='pending' AND email_send_count=1 AND declined_at=now()-interval '5 days') THEN RAISE EXCEPTION 'undo resets record %',r; END IF;
 IF public.friends_undo_reject(f)->>'err' IS DISTINCT FROM 'not_declined' THEN RAISE EXCEPTION 'double undo'; END IF;
 PERFORM public.friends_reject(f);
 IF (SELECT declined_at FROM public.friendships WHERE id=f) IS DISTINCT FROM now()-interval '5 days' THEN RAISE EXCEPTION 'reject after undo extends original window'; END IF;
 PERFORM public.friends_undo_reject(f);
 PERFORM public.friends_accept(f);
 IF NOT public.are_friends(a,b) THEN RAISE EXCEPTION 'explicit acceptance'; END IF;
 r:=public.friends_invite('fixturea329');
 IF r->>'status' IS DISTINCT FROM 'active' OR r->>'direction' IS DISTINCT FROM 'friend' THEN RAISE EXCEPTION 'active duplicate'; END IF;
 PERFORM public.friends_remove(f);
 DELETE FROM public.mail_cooldowns WHERE target_key IN ('pair:'||a||':'||b,'pair:'||b||':'||a);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_invite('fixtureb329'); f:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 PERFORM set_config('request.jwt.claim.sub',b::text,true); PERFORM public.friends_reject(f);
 UPDATE public.friendships SET declined_at=now()-interval '30 days' WHERE id=f;
 IF public.friends_undo_reject(f)->>'err' IS DISTINCT FROM 'expired' THEN RAISE EXCEPTION 'expired undo'; END IF;
 IF jsonb_array_length(public.contacts_list('friends'))<>0 OR public.friends_token_info(tok)->>'err' IS DISTINCT FROM 'not_found' OR public.poll_go_resolve(tok)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'expired lists/token/go'; END IF;
 UPDATE public.mail_cooldowns SET next_allowed_at=now() WHERE target_key='pair:'||a||':'||b;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_invite('fixtureb329');
 IF r->>'ok' IS DISTINCT FROM 'true' OR (r->>'token')::uuid=tok OR (r->>'id')::uuid=f THEN RAISE EXCEPTION 'new invite after expiry %',r; END IF;
 IF public.poll_go_resolve(tok)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'old token reactivated'; END IF;
 f:=(r->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',b::text,true); PERFORM public.friends_reject(f);
 PERFORM set_config('request.jwt.claim.sub',a::text,true); PERFORM public.friends_cancel(f);
 IF public.friends_invite('fixtureb329')->>'reason' IS DISTINCT FROM 'after_reject' THEN RAISE EXCEPTION 'cancel bypass'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.friends_undo_reject(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'cancelled undo'; END IF;
 -- Disabled initial notification never charges a mail counter or clock.
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(c,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.friends_invite('fixturec329'); f:=(r->>'id')::uuid;
 IF r->>'mail_allowed' IS DISTINCT FROM 'false' OR NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=f AND email_send_count=0 AND email_sent_at IS NULL) OR
 EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:'||a||':'||c AND action_key='friend:invite') THEN RAISE EXCEPTION 'disabled initial mail charged'; END IF;
 DELETE FROM public.profiles WHERE id=c;
 IF EXISTS(SELECT 1 FROM public.friendships WHERE id=f) OR public.friends_undo_reject(f)->>'err' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'parent cascade'; END IF;
 RAISE NOTICE '329 OK: duplicates/directions/no cross acceptance/no declined reminder/5-30 boundaries/undo/no reset/explicit acceptance/new token/cancel/cascade/mail flag';
END $$;
ROLLBACK;
