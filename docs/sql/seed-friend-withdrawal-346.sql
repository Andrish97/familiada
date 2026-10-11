-- Isolated database only: historical refusal before the new actor column exists.
\set ON_ERROR_STOP on
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES('friend:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3461-0000-0000-000000000001','a346legacy@example.invalid'),
 ('bbbbbbbb-3461-0000-0000-000000000002','b346legacy@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3461-0000-0000-000000000001','a346legacy@example.invalid','legacya346'),
 ('bbbbbbbb-3461-0000-0000-000000000002','b346legacy@example.invalid','legacyb346')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.friendships(id,requester_id,addressee_id,status,declined_at,email_send_count)
VALUES ('ffffffff-3461-0000-0000-000000000003','aaaaaaaa-3461-0000-0000-000000000001','bbbbbbbb-3461-0000-0000-000000000002','declined',now()-interval '15 days',1);
INSERT INTO public.mail_cooldowns(action_key,target_key,next_allowed_at)
VALUES('friend:invite_after_reject','pair:aaaaaaaa-3461-0000-0000-000000000001:bbbbbbbb-3461-0000-0000-000000000002',now()+interval '30 days');
