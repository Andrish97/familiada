\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3512-0000-0000-000000000002' AND recipient_email IS NULL)<>10 THEN RAISE EXCEPTION '351 legacy all-state backfill failed'; END IF;
 IF (SELECT count(*) FROM public.poll_tasks WHERE owner_id='aaaaaaaa-3512-0000-0000-000000000001' AND recipient_user_id IS NULL AND recipient_email IN('guest351backfill@example.invalid','spoof351backfill@example.invalid','unknown351backfill@example.invalid'))<>3 THEN RAISE EXCEPTION '351 claimed guest, forged profile or unknown email'; END IF;
 RAISE NOTICE '351 legacy backfill OK: both types/all five states; guests, edited profiles and unknown recipients preserved';
END $$;
DELETE FROM auth.users WHERE id IN('aaaaaaaa-3512-0000-0000-000000000001','bbbbbbbb-3512-0000-0000-000000000002','cccccccc-3512-0000-0000-000000000003','eeeeeeee-3512-0000-0000-000000000005');
