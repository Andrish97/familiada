BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
('friend:invite','pair',432000,true),('friend:resend','pair',432000,true),('poll:share','pair',300,true),('friend:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('aaaaaaaa-3531-0000-0000-000000000001','owner353identity@example.invalid','{"username":"owner353identity"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('eeeeeeee-3531-0000-0000-000000000005','aaaaaaaa-3531-0000-0000-000000000001','recipient353identity@example.invalid','pending');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('eeeeeeee-3531-0000-0000-000000000006','aaaaaaaa-3531-0000-0000-000000000001','recipient353identity@example.invalid','active');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('bbbbbbbb-3531-0000-0000-000000000002','recipient353identity@example.invalid','{"username":"recipient353identity"}');
UPDATE auth.users SET email='changed353identity@example.invalid' WHERE id='bbbbbbbb-3531-0000-0000-000000000002';
UPDATE public.profiles SET email='changed353identity@example.invalid' WHERE id='bbbbbbbb-3531-0000-0000-000000000002';
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('ffffffff-3531-0000-0000-000000000007','aaaaaaaa-3531-0000-0000-000000000001','Panel identity353','poll_text','poll_open','identity353-panel');
DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3531-0000-0000-000000000001',true);
 IF public.poll_share_panel('ffffffff-3531-0000-0000-000000000007')->'subscribers' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'claimed old mailbox remained selectable before address reuse'; END IF;
END $$;
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
 IF NOT EXISTS(SELECT 1 FROM public.friends_list() WHERE user_id='dddddddd-3531-0000-0000-000000000004' AND email='actual353identity@example.invalid') THEN RAISE EXCEPTION 'friend list used profile mailbox'; END IF;
 UPDATE public.user_flags SET email_notifications=false WHERE user_id='dddddddd-3531-0000-0000-000000000004';
 IF public.friends_resend((r->>'id')::uuid)->>'mail_allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'friend reminder bypassed target notification flag'; END IF;
 IF (SELECT email_send_count FROM public.friendships WHERE id=(r->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'mail off spent friend reminder budget'; END IF;
 RAISE NOTICE '353 identity entrypoints: reused mail cannot claim/resend/close, original UID/list/Go retained; friend recipient/mail from Auth';
END $$;
-- Legacy game grant verifies canonical reminder address/flags without inventing a friend parent.
INSERT INTO public.poll_tasks(id,owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES('ffffffff-3531-0000-0000-000000000008','aaaaaaaa-3531-0000-0000-000000000001','dddddddd-3531-0000-0000-000000000004','ffffffff-3531-0000-0000-000000000007','poll_text','identity353-panel');
DO $$ DECLARE r jsonb; BEGIN
 IF public.poll_share_remind('ffffffff-3531-0000-0000-000000000007','ffffffff-3531-0000-0000-000000000008')->>'mail_allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'poll reminder bypassed target notification flag'; END IF;
 IF (SELECT reminder_count FROM public.poll_tasks WHERE id='ffffffff-3531-0000-0000-000000000008')<>0 THEN RAISE EXCEPTION 'mail off spent poll reminder budget'; END IF;
 UPDATE public.user_flags SET email_notifications=true WHERE user_id='dddddddd-3531-0000-0000-000000000004';
 r:=public.poll_share_remind('ffffffff-3531-0000-0000-000000000007','ffffffff-3531-0000-0000-000000000008');
 IF r->>'to' IS DISTINCT FROM 'actual353identity@example.invalid' THEN RAISE EXCEPTION 'poll reminder used profile mailbox %',r; END IF;
END $$;
ROLLBACK;
