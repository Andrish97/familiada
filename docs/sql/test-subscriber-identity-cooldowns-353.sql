BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
('poll:invite_after_reject','pair',2592000,true),('friend:invite','pair',432000,true),('friend:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('aaaaaaaa-3532-0000-0000-000000000001','owner353cool@example.invalid','{"username":"owner353cool"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('eeeeeeee-3532-0000-0000-000000000005','aaaaaaaa-3532-0000-0000-000000000001','recipient353cool@example.invalid','active');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT public.poll_sub_unsubscribe((SELECT token FROM public.poll_subscriptions WHERE id='eeeeeeee-3532-0000-0000-000000000005'));
CREATE TEMP TABLE refusal353 ON COMMIT DROP AS SELECT declined_at+interval '30 days' AS deadline FROM public.poll_subscriptions WHERE id='eeeeeeee-3532-0000-0000-000000000005';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('bbbbbbbb-3532-0000-0000-000000000002','recipient353cool@example.invalid','{"username":"recipient353cool"}');
UPDATE auth.users SET email='changed353cool@example.invalid' WHERE id='bbbbbbbb-3532-0000-0000-000000000002';
UPDATE public.profiles SET email='changed353cool@example.invalid' WHERE id='bbbbbbbb-3532-0000-0000-000000000002';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('cccccccc-3532-0000-0000-000000000003','recipient353cool@example.invalid','{"username":"replacement353cool"}');
DO $$ DECLARE r jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3532-0000-0000-000000000001',true);
 r:=public.friends_invite('changed353cool@example.invalid');
 IF r->>'err' IS DISTINCT FROM 'cooldown' OR (r->>'cooldown_until')::timestamptz IS DISTINCT FROM (SELECT deadline FROM refusal353) THEN RAISE EXCEPTION 'registration/email reset or prolonged refusal %',r; END IF;
 IF public.friends_invite('recipient353cool@example.invalid')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'new owner inherited old refusal'; END IF;
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3532-0000-0000-000000000002',true);
 IF public.friend_invites_from_subscriptions()->>'created' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'auto friendship bypassed refusal'; END IF;
END $$;
INSERT INTO public.mail_cooldowns(action_key,target_key,next_allowed_at) VALUES
('poll:invite_after_reject','pair:aaaaaaaa-3532-0000-0000-000000000001:user:cccccccc-3532-0000-0000-000000000003',now()+interval '9 days'),
('poll:invite_after_reject','pair:cccccccc-3532-0000-0000-000000000003:user:cccccccc-3532-0000-0000-000000000003',now()+interval '9 days');
DELETE FROM auth.users WHERE id='bbbbbbbb-3532-0000-0000-000000000002';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE id='eeeeeeee-3532-0000-0000-000000000005') THEN RAISE EXCEPTION 'deleted holder left source'; END IF;
 IF EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject' AND target_key='pair:aaaaaaaa-3532-0000-0000-000000000001:user:bbbbbbbb-3532-0000-0000-000000000002') THEN RAISE EXCEPTION 'deleted holder left UID refusal clock'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:aaaaaaaa-3532-0000-0000-000000000001:user:cccccccc-3532-0000-0000-000000000003') THEN RAISE EXCEPTION 'holder deletion lost independent refusal'; END IF;
 RAISE NOTICE '353 refusal follows UID without reset; new mailbox owner independent; account cascade clears derived clock';
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DELETE FROM auth.users WHERE id='aaaaaaaa-3532-0000-0000-000000000001';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject' AND target_key LIKE 'pair:aaaaaaaa-3532-0000-0000-000000000001:%') THEN RAISE EXCEPTION 'owner left derived refusal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:cccccccc-3532-0000-0000-000000000003:user:cccccccc-3532-0000-0000-000000000003') THEN RAISE EXCEPTION 'owner cascade crossed into another owner'; END IF;
END $$;
ROLLBACK;
