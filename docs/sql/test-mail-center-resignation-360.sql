BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3594-0000-0000-000000000001','owner359resign@example.invalid',false,now(),'{"username":"owner359resign"}'),
 ('bbbbbbbb-3594-0000-0000-000000000002','account359resign@example.invalid',false,now(),'{"username":"account359resign"}');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001','Global359','poll_text','poll_open','resign359');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id) VALUES
 ('dddddddd-3594-0000-0000-000000000004','cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001');
INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,email_send_count,email_sent_at) VALUES
 ('aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','active',1,now()-interval '1 day');
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,status) VALUES
 ('aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','cccccccc-3594-0000-0000-000000000003','poll_text','resign359','pending'),
 ('aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','cccccccc-3594-0000-0000-000000000003','poll_text','resign359','done'),
 ('aaaaaaaa-3594-0000-0000-000000000001','other359resign@example.invalid','cccccccc-3594-0000-0000-000000000003','poll_text','resign359','pending');
INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_email,device_type) VALUES
 ('dddddddd-3594-0000-0000-000000000004','cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','host'),
 ('dddddddd-3594-0000-0000-000000000004','cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001','other359resign@example.invalid','host');
DO $$ DECLARE tok uuid; r jsonb; secret text; issued jsonb; refusal timestamptz; BEGIN
 tok:=public._ensure_unsub_token('address359resign@example.invalid');
 issued:=public.mail_center_issue_link_prototype('address359resign@example.invalid','footer'); secret:=public.mail_center_exchange_link_prototype(issued->>'token')->>'session_secret';
 r:=public.mail_center_set_notifications_prototype(secret,false);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'resignation failed %',r; END IF;
 IF public._contact_mail_enabled('address359resign@example.invalid') THEN RAISE EXCEPTION 'global flag ignored'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE subscriber_email='address359resign@example.invalid' AND status='declined' AND email_send_count=1) THEN RAISE EXCEPTION 'subscription/refusal/budget'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_email='address359resign@example.invalid' AND status IN('pending','opened')) THEN RAISE EXCEPTION 'active poll task survived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_email='address359resign@example.invalid' AND status='done') THEN RAISE EXCEPTION 'completed task erased'; END IF;
 IF EXISTS(SELECT 1 FROM public.control_device_shares WHERE recipient_email='address359resign@example.invalid' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'mail device grant survived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.control_device_shares WHERE recipient_email='other359resign@example.invalid' AND revoked_at IS NULL) OR NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_email='other359resign@example.invalid' AND status='pending') THEN RAISE EXCEPTION 'other recipient affected'; END IF;
 SELECT declined_at INTO refusal FROM public.poll_subscriptions WHERE subscriber_email='address359resign@example.invalid';
 r:=public.mail_anon_resign_prototype(tok);
 IF (SELECT declined_at FROM public.poll_subscriptions WHERE subscriber_email='address359resign@example.invalid') IS DISTINCT FROM refusal THEN RAISE EXCEPTION 'idempotent resignation renewed refusal'; END IF;
 IF public.mail_anon_resign_prototype(public._ensure_unsub_token('account359resign@example.invalid'))->>'error' IS DISTINCT FROM 'requires_login' THEN RAISE EXCEPTION 'registered scope changed prematurely'; END IF;
 RAISE NOTICE 'Anonymous global resignation: subscription/task/device closure, budgets/history, other recipients and registered boundary passed';
 IF public.mail_center_set_notifications_prototype(secret,true)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'verified restore failed'; END IF;
 IF NOT public._contact_mail_enabled('address359resign@example.invalid') THEN RAISE EXCEPTION 'restoration did not clear root'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE subscriber_email='address359resign@example.invalid' AND status IN('pending','active')) OR EXISTS(SELECT 1 FROM public.control_device_shares WHERE recipient_email='address359resign@example.invalid' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'restoration resurrected sources'; END IF;
END $$;
ROLLBACK;
