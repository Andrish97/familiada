BEGIN;
-- Schema-only restores omit policy rows; this fixture rolls back with the test.
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
 VALUES('poll:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3630-1000-0000-000000000001','go-owner363@example.invalid',false,now(),'{"username":"goowner363"}'),
 ('aaaaaaaa-3630-1000-0000-000000000002','go-old363@example.invalid',false,now(),'{"username":"goreceiver363"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status,registered_user_id,identity_tracking_enabled,token)
 VALUES('bbbbbbbb-3630-1000-0000-000000000001','aaaaaaaa-3630-1000-0000-000000000001','go-old363@example.invalid','active','aaaaaaaa-3630-1000-0000-000000000002',true,'cccccccc-3630-1000-0000-000000000001');
DO $$
DECLARE result jsonb; relation_status text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3630-1000-0000-000000000002',true);
 result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
 IF result->>'kind' IS DISTINCT FROM 'sub' OR result->>'registered_user_id' IS DISTINCT FROM 'aaaaaaaa-3630-1000-0000-000000000002'
  OR result->>'friend_conversion_required' IS DISTINCT FROM 'true' OR result->>'subscriber_user_id' IS NOT NULL
 THEN RAISE EXCEPTION 'Go canonical recipient missing or old contract changed'; END IF;
 FOREACH relation_status IN ARRAY ARRAY['pending','declined','active'] LOOP
  UPDATE public.poll_subscriptions SET status=relation_status,declined_at=CASE WHEN relation_status='declined' THEN now() ELSE NULL END WHERE id='bbbbbbbb-3630-1000-0000-000000000001';
  result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
  IF result->>'registered_user_id' IS DISTINCT FROM 'aaaaaaaa-3630-1000-0000-000000000002' OR result->>'status' IS DISTINCT FROM relation_status THEN RAISE EXCEPTION 'relation state lost its canonical account'; END IF;
 END LOOP;
 UPDATE public.poll_subscriptions SET cancelled_at=now(),status='declined',declined_at=now() WHERE id='bbbbbbbb-3630-1000-0000-000000000001';
 result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
 IF result->>'cancelled_at' IS NULL OR result->>'declined_at' IS NULL THEN RAISE EXCEPTION 'cancellation metadata missing'; END IF;
 UPDATE public.poll_subscriptions SET cancelled_at=NULL,status='active',declined_at=NULL WHERE id='bbbbbbbb-3630-1000-0000-000000000001';
 UPDATE auth.users SET email='go-new363@example.invalid' WHERE id='aaaaaaaa-3630-1000-0000-000000000002';
 -- The actual account change also synchronizes the public profile.
 UPDATE public.profiles SET email='go-new363@example.invalid' WHERE id='aaaaaaaa-3630-1000-0000-000000000002';
 result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
 IF result->>'registered_user_id' IS DISTINCT FROM 'aaaaaaaa-3630-1000-0000-000000000002' OR result->>'subscriber_email' IS DISTINCT FROM 'go-old363@example.invalid'
 THEN RAISE EXCEPTION 'mail change lost canonical account or rewrote source address'; END IF;
 INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data)
 VALUES('aaaaaaaa-3630-1000-0000-000000000003','go-old363@example.invalid',false,now(),'{"username":"goother363"}');
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3630-1000-0000-000000000003',true);
 result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
 IF result->>'registered_user_id' IS DISTINCT FROM 'aaaaaaaa-3630-1000-0000-000000000002' THEN RAISE EXCEPTION 'old address new owner reassigned recipient'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
 IF result->>'registered_user_id' IS DISTINCT FROM 'aaaaaaaa-3630-1000-0000-000000000002' THEN RAISE EXCEPTION 'anonymous resolution lost canonical account'; END IF;
 DELETE FROM auth.users WHERE id='aaaaaaaa-3630-1000-0000-000000000002';
 result:=public.poll_go_resolve('cccccccc-3630-1000-0000-000000000001');
 IF result->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'account deletion retained subscription token'; END IF;
 RAISE NOTICE 'Go363 stored identity, changed address, new address owner, anonymous result and deletion passed';
END $$;
ROLLBACK;
