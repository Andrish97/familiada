\set ON_ERROR_STOP on
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.friendships WHERE id='ffffffff-3461-0000-0000-000000000003'
   AND decision_user_id=addressee_id AND cancelled_at IS NULL AND email_send_count=1) THEN
   RAISE EXCEPTION 'historical actor/budget not preserved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.friendships f JOIN public.mail_cooldowns c
   ON c.action_key='friend:invite_after_reject'
   AND c.target_key='pair:'||f.requester_id||':'||f.addressee_id
   WHERE f.id='ffffffff-3461-0000-0000-000000000003'
   AND c.next_allowed_at=f.declined_at+interval '30 days') THEN
   RAISE EXCEPTION 'legacy repeated rejection clock not corrected'; END IF;
 RAISE NOTICE '346 backfill OK: original recipient, retained budget, original refusal expiry';
END $$;
DELETE FROM public.mail_cooldowns WHERE target_key='pair:aaaaaaaa-3461-0000-0000-000000000001:bbbbbbbb-3461-0000-0000-000000000002';
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-3461-0000-0000-000000000001','bbbbbbbb-3461-0000-0000-000000000002');
