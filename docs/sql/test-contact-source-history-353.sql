BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('friend:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE id IN ('eeeeeeee-3533-0000-0000-000000000005','eeeeeeee-3533-0000-0000-000000000006') AND (identity_tracking_enabled OR registered_user_id IS NOT NULL)) THEN RAISE EXCEPTION 'historical mailbox guessed as current holder'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id='ffffffff-3533-0000-0000-000000000008' AND source_kind='game' AND source_subscription_id IS NULL AND source_friendship_id IS NULL AND recipient_user_id='bbbbbbbb-3533-0000-0000-000000000002') THEN RAISE EXCEPTION 'historical task changed or source guessed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3533-0000-0000-000000000002',true);
 IF public.friend_invites_from_subscriptions()->>'created' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'historical mailbox created new affinity'; END IF;
 PERFORM set_config('request.jwt.claim.sub','dddddddd-3533-0000-0000-000000000004',true);
 IF public.friend_invites_from_subscriptions()->>'created' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'known historical UID lost relationship'; END IF;
 RAISE NOTICE '353 history: unknown email has no invented recipient/source; known UID preserved';
END $$;
ROLLBACK;
BEGIN;
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3533-0000-0000-000000000001','bbbbbbbb-3533-0000-0000-000000000002','dddddddd-3533-0000-0000-000000000004');
COMMIT;
