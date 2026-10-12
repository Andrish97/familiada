-- Synthetic users, no mail, no persistent changes. Requires the real Auth
-- handle_new_user trigger, as production does; do not synthesize profiles.
BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
('aaaaaaaa-3541-0000-0000-000000000001',NULL,true,'{"username":"guest354false","is_guest":false,"language":"en"}'),
('aaaaaaaa-3541-0000-0000-000000000002',NULL,true,'{"username":"guest354missing"}'),
('aaaaaaaa-3541-0000-0000-000000000003','regular354@example.invalid',false,'{"username":"regular354","is_guest":false}');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles WHERE id IN
 ('aaaaaaaa-3541-0000-0000-000000000001','aaaaaaaa-3541-0000-0000-000000000002')
 AND is_guest AND guest_last_active_at IS NOT NULL AND guest_expires_at > now()) <> 2
 THEN RAISE EXCEPTION 'anonymous initializer trusted editable metadata'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users u WHERE u.id IN
 ('aaaaaaaa-3541-0000-0000-000000000001','aaaaaaaa-3541-0000-0000-000000000002')
 AND public._poll_identity_regular(u.id,to_jsonb(u)))
 THEN RAISE EXCEPTION 'anonymous classified as regular'; END IF;
END $$;
UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data||'{"is_guest":false,"language":"uk"}'
 WHERE id='aaaaaaaa-3541-0000-0000-000000000001';
UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data||'{"is_guest":true}'
 WHERE id='aaaaaaaa-3541-0000-0000-000000000003';
DO $$ BEGIN
 IF (SELECT raw_user_meta_data->>'is_guest' FROM auth.users WHERE id='aaaaaaaa-3541-0000-0000-000000000001') IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'guest metadata update bypass'; END IF;
 IF (SELECT raw_user_meta_data->>'language' FROM auth.users WHERE id='aaaaaaaa-3541-0000-0000-000000000001') IS DISTINCT FROM 'uk'
 THEN RAISE EXCEPTION 'unrelated metadata lost'; END IF;
 IF (SELECT raw_user_meta_data->>'is_guest' FROM auth.users WHERE id='aaaaaaaa-3541-0000-0000-000000000003') IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'regular metadata changed role'; END IF;
END $$;
UPDATE auth.users SET email='converted354@example.invalid',email_confirmed_at=now()
 WHERE id='aaaaaaaa-3541-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3541-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.guest_convert_account('converted354@example.invalid')->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'genuine conversion denied'; END IF;
END $$;
RESET ROLE;
UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data||'{"is_guest":true}'
 WHERE id='aaaaaaaa-3541-0000-0000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id='aaaaaaaa-3541-0000-0000-000000000001' AND NOT p.is_guest
 AND p.guest_expires_at IS NULL AND u.raw_user_meta_data->>'is_guest'='false'
 AND public._poll_identity_regular(u.id,to_jsonb(u)))
 THEN RAISE EXCEPTION 'converted account regressed to guest'; END IF;
 RAISE NOTICE '354: initializer, missing/false metadata, both update directions, unrelated data and verified conversion passed';
END $$;
ROLLBACK;
