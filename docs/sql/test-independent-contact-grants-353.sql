BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('friend:invite_after_reject','pair',2592000,true),('poll:share','pair',300,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('aaaaaaaa-3534-0000-0000-000000000001','owner353independent@example.invalid','{"username":"owner353independent"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('eeeeeeee-3534-0000-0000-000000000005','aaaaaaaa-3534-0000-0000-000000000001','recipient353independent@example.invalid','active');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('dddddddd-3534-0000-0000-000000000004','aaaaaaaa-3534-0000-0000-000000000001','Independent subscriber353','poll_text','poll_open','independent353');
INSERT INTO public.poll_tasks(id,owner_id,recipient_email,game_id,poll_type,share_key_poll,source_subscription_id) VALUES('ffffffff-3534-0000-0000-000000000006','aaaaaaaa-3534-0000-0000-000000000001','recipient353independent@example.invalid','dddddddd-3534-0000-0000-000000000004','poll_text','independent353','eeeeeeee-3534-0000-0000-000000000005');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('bbbbbbbb-3534-0000-0000-000000000002','recipient353independent@example.invalid','{"username":"recipient353independent"}');
DO $$ DECLARE proposal uuid; token uuid; BEGIN
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3534-0000-0000-000000000002',true);
 IF public.friend_invites_from_subscriptions()->>'created' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'proposal fixture'; END IF;
 SELECT id INTO proposal FROM public.friendships WHERE requester_id='aaaaaaaa-3534-0000-0000-000000000001' AND addressee_id='bbbbbbbb-3534-0000-0000-000000000002';
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3534-0000-0000-000000000001',true);
 IF public.friends_cancel(proposal)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'cancel proposal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id='ffffffff-3534-0000-0000-000000000006' AND source_subscription_id='eeeeeeee-3534-0000-0000-000000000005') THEN RAISE EXCEPTION 'friend proposal cancel destroyed independent subscriber grant'; END IF;
 SELECT t.token INTO token FROM public.poll_tasks t WHERE id='ffffffff-3534-0000-0000-000000000006';
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3534-0000-0000-000000000002',true);
 IF public.poll_task_opened(token) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'independent subscriber access lost'; END IF;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3534-0000-0000-000000000001',true);
 PERFORM public.polls_hub_subscriber_remove('eeeeeeee-3534-0000-0000-000000000005');
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE id='ffffffff-3534-0000-0000-000000000006') THEN RAISE EXCEPTION 'own source revoke retained subscriber task'; END IF;
END $$;
ROLLBACK;
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:share','pair',300,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
('aaaaaaaa-3534-0000-0000-000000000001','owner353independent@example.invalid','{"username":"owner353independent"}'),
('bbbbbbbb-3534-0000-0000-000000000002','recipient353independent@example.invalid','{"username":"recipient353independent"}');
INSERT INTO public.friendships(id,requester_id,addressee_id,status) VALUES('ffffffff-3534-0000-0000-000000000007','aaaaaaaa-3534-0000-0000-000000000001','bbbbbbbb-3534-0000-0000-000000000002','active');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('dddddddd-3534-0000-0000-000000000004','aaaaaaaa-3534-0000-0000-000000000001','Independent friend353','poll_text','poll_open','independent353');
-- Email-origin source bound to an account, alongside a separate, explicitly
-- recorded friend grant. Direct account subscriptions now live in friendships.
INSERT INTO public.poll_subscriptions(id,owner_id,registered_user_id,subscriber_email,status)
VALUES('eeeeeeee-3534-0000-0000-000000000005','aaaaaaaa-3534-0000-0000-000000000001',
       'bbbbbbbb-3534-0000-0000-000000000002','recipient353independent@example.invalid','active');
DO $$ DECLARE token uuid; BEGIN
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3534-0000-0000-000000000001',true);
 IF public.poll_share_send('dddddddd-3534-0000-0000-000000000004',ARRAY['bbbbbbbb-3534-0000-0000-000000000002'::uuid],'{}')->>'created' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'friend grant fixture'; END IF;
 PERFORM public.polls_hub_subscriber_remove('eeeeeeee-3534-0000-0000-000000000005');
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id='dddddddd-3534-0000-0000-000000000004' AND source_friendship_id='ffffffff-3534-0000-0000-000000000007') THEN RAISE EXCEPTION 'subscriber cancel destroyed independent friend grant'; END IF;
 SELECT t.token INTO token FROM public.poll_tasks t WHERE game_id='dddddddd-3534-0000-0000-000000000004';
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3534-0000-0000-000000000002',true);
 IF public.poll_task_opened(token) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'independent friend access lost'; END IF;
 PERFORM public.friends_remove('ffffffff-3534-0000-0000-000000000007');
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id='dddddddd-3534-0000-0000-000000000004') THEN RAISE EXCEPTION 'own friendship revoke retained task'; END IF;
 RAISE NOTICE '353 independent grants: friend proposal cancel preserves subscriber grant; subscriber cancel preserves friend grant; own source revokes each';
END $$;
ROLLBACK;
