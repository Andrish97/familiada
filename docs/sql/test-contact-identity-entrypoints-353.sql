BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
('friend:invite','pair',432000,true),('friend:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('aaaaaaaa-3531-0000-0000-000000000001','owner353identity@example.invalid','{"username":"owner353identity"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('eeeeeeee-3531-0000-0000-000000000005','aaaaaaaa-3531-0000-0000-000000000001','recipient353identity@example.invalid','pending');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('bbbbbbbb-3531-0000-0000-000000000002','recipient353identity@example.invalid','{"username":"recipient353identity"}');
UPDATE auth.users SET email='changed353identity@example.invalid' WHERE id='bbbbbbbb-3531-0000-0000-000000000002';
UPDATE public.profiles SET email='changed353identity@example.invalid' WHERE id='bbbbbbbb-3531-0000-0000-000000000002';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('cccccccc-3531-0000-0000-000000000003','recipient353identity@example.invalid','{"username":"replacement353identity"}');
DO $$ DECLARE token uuid; r jsonb; BEGIN
 SELECT s.token INTO token FROM public.poll_subscriptions s WHERE id='eeeeeeee-3531-0000-0000-000000000005';
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3531-0000-0000-000000000001',true);
 IF public.polls_hub_subscriber_resend('eeeeeeee-3531-0000-0000-000000000005')->>'err' IS DISTINCT FROM 'has_account' THEN RAISE EXCEPTION 'reminder leaked to reused address'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscribers_list() WHERE id='eeeeeeee-3531-0000-0000-000000000005' AND friend_user_id='bbbbbbbb-3531-0000-0000-000000000002' AND email='changed353identity@example.invalid') THEN RAISE EXCEPTION 'list displayed new owner of old email'; END IF;
 PERFORM set_config('request.jwt.claim.sub','cccccccc-3531-0000-0000-000000000003',true);
 IF public.friend_invites_from_subscriptions()->>'created' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'reused address received old proposal'; END IF;
 IF public.poll_sub_unsubscribe(token)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'new address holder changed old source'; END IF;
 IF public.poll_sub_accept_email(token,'recipient353identity@example.invalid')->>'error' IS DISTINCT FROM 'has_account' THEN RAISE EXCEPTION 'new holder accepted old source'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.poll_go_resolve(token)->>'friend_conversion_required' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Go offered email acceptance'; END IF;
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3531-0000-0000-000000000002',true);
 IF public.friend_invites_from_subscriptions()->>'created' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'original holder lost proposal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE requester_id='aaaaaaaa-3531-0000-0000-000000000001' AND addressee_id='bbbbbbbb-3531-0000-0000-000000000002' AND status='pending') THEN RAISE EXCEPTION 'wrong proposal identity'; END IF;
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('dddddddd-3531-0000-0000-000000000004','actual353identity@example.invalid','{"username":"canonical353identity"}');
UPDATE public.profiles SET email='fake353identity@example.invalid' WHERE id='dddddddd-3531-0000-0000-000000000004';
DO $$ DECLARE r jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3531-0000-0000-000000000001',true);
 IF public.friends_invite('fake353identity@example.invalid')->>'err' IS DISTINCT FROM 'unknown_user' THEN RAISE EXCEPTION 'profile intercepted mailbox'; END IF;
 r:=public.friends_invite('CANONICAL353IDENTITY');
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'to' IS DISTINCT FROM 'actual353identity@example.invalid' THEN RAISE EXCEPTION 'username reminder used profile mailbox %',r; END IF;
 RAISE NOTICE '353 identity entrypoints: reused mail cannot claim/resend/close, original UID/list/Go retained; friend recipient/mail from Auth';
END $$;
ROLLBACK;
