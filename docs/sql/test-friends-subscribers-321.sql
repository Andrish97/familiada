-- Wyłącznie odizolowana baza po local-stubs + schema.sql + migracji 321.
\set ON_ERROR_STOP on
BEGIN;
-- schema.sql zawiera definicje bez danych; odtwórz wymagane polityki maili.
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
('poll:invite','pair',86400,true),('poll:resend','pair',86400,true),
('poll:share','pair',86400,true),('poll:invite_after_reject','pair',2592000,true),
('friend:invite','pair',86400,true),('friend:resend','pair',86400,true),
('friend:invite_after_reject','pair',2592000,true)
ON CONFLICT(action_key) DO NOTHING;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
INSERT INTO auth.users(id,email) VALUES
('aaaaaaaa-3210-0000-0000-000000000001','owner321@example.com'),
('bbbbbbbb-3210-0000-0000-000000000002','friend321@example.com'),
('cccccccc-3210-0000-0000-000000000003','third321@example.com');
INSERT INTO public.profiles(id,email,username) VALUES
('aaaaaaaa-3210-0000-0000-000000000001','owner321@example.com','owner321'),
('bbbbbbbb-3210-0000-0000-000000000002','friend321@example.com','friend321'),
('cccccccc-3210-0000-0000-000000000003','third321@example.com','third321')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
CREATE TEMP TABLE result(k text,v jsonb);
GRANT ALL ON result TO authenticated;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
('a1a1a1a1-3210-0000-0000-000000000001','aaaaaaaa-3210-0000-0000-000000000001','Poll321','poll_text','poll_open','key321');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3210-0000-0000-000000000001',true);
INSERT INTO result SELECT 'bad',public.subscribers_invite('not-email');
SELECT pg_temp.check_result((SELECT v->>'err'='invalid_email' FROM result WHERE k='bad'),'invalid email rejected');
INSERT INTO result SELECT 'account',public.subscribers_invite('friend321@example.com');
SELECT pg_temp.check_result((SELECT v->>'err'='has_account' FROM result WHERE k='account'),'account redirected to friends');
INSERT INTO result SELECT 'email',public.subscribers_invite('Only321@Example.com');
SELECT pg_temp.check_result((SELECT (v->>'ok')::bool FROM result WHERE k='email'),'email-only subscriber created');
SELECT pg_temp.check_result((SELECT count(*)=1 AND min(email)='only321@example.com' FROM public.subscribers_list()),'subscriber normalized and visible');
INSERT INTO result SELECT 'again',public.subscribers_invite('only321@example.com');
SELECT pg_temp.check_result((SELECT (v->>'already')::bool FROM result WHERE k='again'),'subscriber invite idempotent');
SELECT set_config('request.jwt.claim.sub','cccccccc-3210-0000-0000-000000000003',true);
SELECT pg_temp.check_result((SELECT count(*)=0 FROM public.subscribers_list()),'other owner cannot see subscriber');
INSERT INTO result SELECT 'foreign',public.poll_share_send('a1a1a1a1-3210-0000-0000-000000000001','{}','{}');
SELECT pg_temp.check_result((SELECT v->>'err'='game not found' FROM result WHERE k='foreign'),'foreign poll sharing rejected');
RESET ROLE;
-- Konto powstało po zaproszeniu: subskrypcja zostaje, pojawia się znajomość bez maila.
INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES
('aaaaaaaa-3210-0000-0000-000000000001','friend321@example.com','active');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3210-0000-0000-000000000002',true);
SELECT public.poll_claim_email_records();
SELECT pg_temp.check_result((SELECT count(*)=1 AND min(direction)='incoming' AND min(email_send_count)=0 FROM public.friends_list()),'account claim creates silent friendship invitation');
SELECT public.poll_claim_email_records();
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.friends_list()),'claim idempotent');
INSERT INTO result SELECT 'friend',public.friends_accept((SELECT id FROM public.friends_list() LIMIT 1));
SELECT pg_temp.check_result((SELECT (v->>'ok')::bool FROM result WHERE k='friend'),'friend accepted');
RESET ROLE;
SELECT pg_temp.check_result(NOT EXISTS(SELECT 1 FROM public.poll_subscriptions WHERE lower(subscriber_email)='friend321@example.com'),'acceptance removes subscriber');
SELECT pg_temp.check_result(EXISTS(SELECT 1 FROM public.friendships WHERE status='active'),'friendship retained');
UPDATE public.poll_subscriptions SET status='active',accepted_at=now() WHERE subscriber_email='only321@example.com';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3210-0000-0000-000000000001',true);
INSERT INTO result SELECT 'share',public.poll_share_send('a1a1a1a1-3210-0000-0000-000000000001',ARRAY['bbbbbbbb-3210-0000-0000-000000000002','cccccccc-3210-0000-0000-000000000003']::uuid[],ARRAY[(SELECT id FROM public.subscribers_list() LIMIT 1)]);
SELECT pg_temp.check_result((SELECT (v->>'created')::int=2 FROM result WHERE k='share'),'only friend and own active subscriber receive tasks');
INSERT INTO result SELECT 'shareagain',public.poll_share_send('a1a1a1a1-3210-0000-0000-000000000001',ARRAY['bbbbbbbb-3210-0000-0000-000000000002']::uuid[],ARRAY[(SELECT id FROM public.subscribers_list() LIMIT 1)]);
SELECT pg_temp.check_result((SELECT (v->>'created')::int=0 AND (v->>'kept')::int=2 FROM result WHERE k='shareagain'),'sharing idempotent');
RESET ROLE;
-- Token jest pobierany jako fixture/admin: FORCE RLS celowo blokuje bezpośredni SELECT authenticated.
INSERT INTO result SELECT 'friend-token',jsonb_build_object('token',token) FROM public.friendships LIMIT 1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3210-0000-0000-000000000001',true);
INSERT INTO result SELECT 'resolve',public.poll_go_resolve((SELECT (v->>'token')::uuid FROM result WHERE k='friend-token'));
SELECT pg_temp.check_result((SELECT v->>'kind'='friend' FROM result WHERE k='resolve'),'friend token resolves before old subscription');
RESET ROLE;
-- Niezalogowany nie może dodać subskrybenta ani wysłać ankiety.
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.check_result(public.subscribers_invite('x321@example.com')->>'err'='auth required','anonymous invite rejected');
-- Usunięcie konta usuwa również urządzenia zapisane po e-mailu.
INSERT INTO public.shared_devices(owner_id,recipient_id,recipient_email,device_type,game_id)
VALUES('aaaaaaaa-3210-0000-0000-000000000001','bbbbbbbb-3210-0000-0000-000000000002','friend321@example.com','host','a1a1a1a1-3210-0000-0000-000000000001');
SELECT public.delete_user_everything('bbbbbbbb-3210-0000-0000-000000000002');
SELECT pg_temp.check_result(NOT EXISTS(SELECT 1 FROM public.shared_devices WHERE recipient_email='friend321@example.com'),'account deletion cleans email devices');
SELECT pg_temp.check_result(NOT EXISTS(SELECT 1 FROM public.friendships),'account deletion cleans friendships');
SELECT pg_temp.check_result(NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE recipient_user_id='bbbbbbbb-3210-0000-0000-000000000002'),'account deletion cleans tasks');
ROLLBACK;
