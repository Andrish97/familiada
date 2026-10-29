-- Synthetic identities only. No mail is queued; all changes roll back.
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES ('friend:invite','pair',432000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
('aaaaaaaa-3525-0000-0000-000000000001','owner352guest@example.invalid',false,'{"username":"owner352guest"}'),
('bbbbbbbb-3525-0000-0000-000000000002',NULL,true,'{"username":"guest352audit","is_guest":true}');
-- Production Auth inserts call handle_new_user; local stubs may not.
INSERT INTO public.profiles(id,email,username,is_guest)
SELECT id,email,raw_user_meta_data->>'username',coalesce(is_anonymous,false)
FROM auth.users WHERE id IN ('aaaaaaaa-3525-0000-0000-000000000001','bbbbbbbb-3525-0000-0000-000000000002')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 IF public.guest_convert_account('unverified352@example.invalid')->>'error'<>'not_authenticated' THEN RAISE EXCEPTION 'anonymous conversion'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3525-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.guest_convert_account('invalid')->>'error'<>'invalid_email' THEN RAISE EXCEPTION 'invalid email'; END IF;
 IF public.guest_convert_account('unverified352@example.invalid')->>'error'<>'not_confirmed' THEN RAISE EXCEPTION 'guest forged mailbox'; END IF;
END $$;
RESET ROLE;
UPDATE auth.users SET email='verified352@example.invalid' WHERE id='bbbbbbbb-3525-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.guest_convert_account('verified352@example.invalid')->>'error'<>'not_confirmed' THEN RAISE EXCEPTION 'unconfirmed conversion'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3525-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.friends_invite('unverified352@example.invalid')->>'err'<>'unknown_user' THEN RAISE EXCEPTION 'forged guest intercepted invitation'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.friendships WHERE requester_id='aaaaaaaa-3525-0000-0000-000000000001') THEN RAISE EXCEPTION 'unexpected invitation'; END IF;
 IF NOT (SELECT is_guest FROM public.profiles WHERE id='bbbbbbbb-3525-0000-0000-000000000002') THEN RAISE EXCEPTION 'denied conversion changed profile'; END IF;
END $$;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='bbbbbbbb-3525-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3525-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.guest_convert_account('unverified352@example.invalid')->>'error'<>'email_mismatch' THEN RAISE EXCEPTION 'confirmed account forged different mailbox'; END IF;
 IF public.guest_convert_account(' VERIFIED352@EXAMPLE.INVALID ')->>'ok'<>'true' THEN RAISE EXCEPTION 'verified conversion failed'; END IF;
 IF public.guest_convert_account('verified352@example.invalid')->>'error'<>'not_guest' THEN RAISE EXCEPTION 'repeated conversion'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='bbbbbbbb-3525-0000-0000-000000000002' AND NOT is_guest AND email='verified352@example.invalid' AND guest_expires_at IS NULL AND guest_last_active_at IS NULL) THEN RAISE EXCEPTION 'conversion profile invalid'; END IF;
 IF (SELECT raw_user_meta_data->>'is_guest' FROM auth.users WHERE id='bbbbbbbb-3525-0000-0000-000000000002') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'guest metadata unchanged'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3525-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.friends_invite('verified352@example.invalid')->>'ok'<>'true' THEN RAISE EXCEPTION 'verified recipient unavailable'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE requester_id='aaaaaaaa-3525-0000-0000-000000000001' AND addressee_id='bbbbbbbb-3525-0000-0000-000000000002' AND status='pending') THEN RAISE EXCEPTION 'wrong verified recipient'; END IF;
 RAISE NOTICE '352 guest conversion: auth, validation, confirmation, mailbox match, unchanged denial, valid conversion and friendship passed';
END $$;
ROLLBACK;
