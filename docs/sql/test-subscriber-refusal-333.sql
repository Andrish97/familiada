-- Odmowa = wypisanie, cykl 5/30 i brak obejścia po rejestracji.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('poll:invite','pair',432000,true),('poll:resend','pair',432000,true),
 ('friend:invite','pair',432000,true),('friend:invite_after_reject','pair',2592000,true)
ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3330-0000-0000-000000000001','owner333@example.net'),
 ('bbbbbbbb-3330-0000-0000-000000000002','account333@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3330-0000-0000-000000000001','owner333@example.net','fixtureowner333'),
 ('bbbbbbbb-3330-0000-0000-000000000002','account333@example.net','fixtureaccount333')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
DO $$
DECLARE uid uuid:='aaaaaaaa-3330-0000-0000-000000000001';
 recipient uuid:='bbbbbbbb-3330-0000-0000-000000000002';
 r jsonb; sid uuid; tok uuid; oldtok uuid; stamp timestamptz; u uuid; fid uuid;
BEGIN
 IF public.subscribers_invite('one333@example.net')->>'err'<>'auth required' THEN RAISE EXCEPTION 'authentication'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 IF public.subscribers_invite('bad')->>'err'<>'invalid_email' THEN RAISE EXCEPTION 'invalid address'; END IF;
 IF public.subscribers_invite('account333@example.net')->>'err'<>'has_account' THEN RAISE EXCEPTION 'account'; END IF;
 r:=public.subscribers_invite(' ONE333@EXAMPLE.NET '); sid:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF r->>'mail_allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'initial invite %',r; END IF;
 IF public.subscribers_invite('one333@example.net')->>'already' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'duplicate'; END IF;
 r:=public.polls_hub_subscriber_resend(sid);
 IF r->>'to'<>'one333@example.net' OR r->>'link'<>'/go/?s='||tok OR r->>'mail_allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'initial delivery %',r; END IF;
 IF public.polls_hub_subscriber_resend(sid)->>'err'<>'cooldown' OR (SELECT email_send_count FROM public.poll_subscriptions WHERE id=sid)<>1 THEN RAISE EXCEPTION 'resend cooldown/count'; END IF;
 IF NOT public.poll_go_sub_decline(tok) THEN RAISE EXCEPTION 'decline'; END IF;
 SELECT declined_at INTO stamp FROM public.poll_subscriptions WHERE id=sid;
 IF public.poll_go_sub_decline(tok) OR public.poll_sub_unsubscribe(tok)->>'ok'<>'false'
 OR (SELECT declined_at FROM public.poll_subscriptions WHERE id=sid) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'repeat extended refusal'; END IF;
 IF (SELECT count(*) FROM public.subscribers_list() WHERE id=sid)<>1
 OR public.contacts_list('subscribers')->0->>'decline_expires_at' IS NULL THEN RAISE EXCEPTION 'declined metadata'; END IF;
 IF public.polls_hub_subscriber_resend(sid)->>'ok'<>'false' THEN RAISE EXCEPTION 'refusal reminder'; END IF;
 PERFORM public.polls_hub_subscriber_remove(sid);
 IF public.subscribers_invite('one333@example.net')->>'err'<>'cooldown' THEN RAISE EXCEPTION 'owner removal bypass'; END IF;
 -- Exact five-day boundary: closed history survives and continues blocking.
 UPDATE public.poll_subscriptions SET status='declined',cancelled_at=NULL,declined_at=now()-interval '5 days' WHERE id=sid;
 IF EXISTS(SELECT 1 FROM public.subscribers_list() WHERE id=sid) THEN RAISE EXCEPTION 'five day visibility'; END IF;
 IF public._subscriber_refusal_until(uid,'one333@example.net') IS NULL THEN RAISE EXCEPTION 'hidden refusal missing'; END IF;
 -- Exact thirty-day boundary, no automatic new record/mail.
 UPDATE public.poll_subscriptions SET declined_at=now()-interval '30 days' WHERE id=sid;
 UPDATE public.mail_cooldowns SET next_allowed_at=now() WHERE target_key='pair:'||uid::text||':email:'||md5('one333@example.net');
 IF public.poll_go_resolve(tok)->>'error'<>'invalid_token' OR public.poll_go_subscribe_email(tok,'one333@example.net') THEN RAISE EXCEPTION 'old token'; END IF;
 oldtok:=tok; r:=public.subscribers_invite('one333@example.net');
 IF r->>'ok'<>'true' OR (r->>'token')::uuid=oldtok THEN RAISE EXCEPTION 'explicit fresh invite %',r; END IF;
 -- Active withdrawal has exactly the refusal contract, not cancellation.
 r:=public.subscribers_invite('withdraw333@example.net'); sid:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF public.poll_sub_accept_email(tok,'withdraw333@example.net')->>'ok'<>'true'
 OR public.poll_sub_unsubscribe(tok)->>'ok'<>'true' THEN RAISE EXCEPTION 'withdraw active'; END IF;
 IF (SELECT status FROM public.poll_subscriptions WHERE id=sid)<>'declined'
 OR public.subscribers_invite('withdraw333@example.net')->>'err'<>'cooldown' THEN RAISE EXCEPTION 'withdraw not refusal'; END IF;
 -- Global suppression persists after refusal expiry and skips every mail reservation/count.
 r:=public.subscribers_invite('muted333@example.net'); sid:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 u:=public._ensure_unsub_token('muted333@example.net');
 IF public.poll_go_global_unsubscribe(u)->>'ok'<>'true' THEN RAISE EXCEPTION 'global suppression'; END IF;
 SELECT suppressed_at INTO stamp FROM public.email_unsub_tokens WHERE token=u;
 PERFORM public.poll_go_global_unsubscribe(u);
 IF (SELECT suppressed_at FROM public.email_unsub_tokens WHERE token=u) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'suppression reset'; END IF;
 UPDATE public.poll_subscriptions SET declined_at=now()-interval '30 days' WHERE id=sid;
 DELETE FROM public.mail_cooldowns WHERE target_key='pair:'||uid::text||':email:'||md5('muted333@example.net');
 r:=public.subscribers_invite('muted333@example.net'); sid:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF r->>'mail_allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'flag not persistent'; END IF;
 r:=public.polls_hub_subscriber_resend(sid);
 IF r->>'mail_allowed' IS DISTINCT FROM 'false' OR r ? 'to' OR r ? 'link'
 OR (SELECT email_send_count FROM public.poll_subscriptions WHERE id=sid)<>0
 OR EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key='pair:'||uid::text||':email:'||md5('muted333@example.net')) THEN RAISE EXCEPTION 'disabled mail side effects %',r; END IF;
 IF NOT public.poll_go_sub_decline(tok) OR public.subscribers_invite('muted333@example.net')->>'err'<>'cooldown' THEN RAISE EXCEPTION 'mail off refusal bypass'; END IF;
 -- Historical mail budget: a fresh row cannot reset two deliveries/30 days.
 r:=public.subscribers_invite('budget333@example.net'); sid:=(r->>'id')::uuid;
 UPDATE public.poll_subscriptions SET email_send_count=2,email_sent_at=now() WHERE id=sid;
 DELETE FROM public.mail_cooldowns WHERE target_key='pair:'||uid::text||':email:'||md5('budget333@example.net');
 IF public.polls_hub_subscriber_resend(sid)->>'reason'<>'mail_limit' THEN RAISE EXCEPTION 'mail budget'; END IF;
 PERFORM public.polls_hub_subscriber_remove(sid);
 IF public.subscribers_invite('budget333@example.net')->>'err'<>'cooldown' THEN RAISE EXCEPTION 'fresh row resets budget'; END IF;
 UPDATE public.poll_subscriptions SET email_sent_at=now()-interval '30 days' WHERE id=sid;
 IF public.subscribers_invite('budget333@example.net')->>'ok'<>'true' THEN RAISE EXCEPTION 'mail budget exact expiry'; END IF;
 -- User flag joins the durable email suppression flag.
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(recipient,false)
 ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 IF public._contact_mail_enabled('account333@example.net') THEN RAISE EXCEPTION 'account flag'; END IF;
 -- Legacy account RPCs cannot create an active subscriber relation.
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_user_id,status)
 VALUES(uid,recipient,'pending') RETURNING id,token INTO sid,tok;
 IF public.polls_hub_subscription_accept(sid)->>'ok'<>'false'
 OR public.polls_hub_subscription_cancel(sid)->>'ok'<>'false' THEN RAISE EXCEPTION 'foreign recipient RPC'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 IF public.polls_hub_subscription_accept(sid)->>'error'<>'has_account' THEN RAISE EXCEPTION 'legacy acceptance'; END IF;
 r:=public.polls_hub_subscription_cancel(sid);
 IF r->>'ok'<>'true' OR (SELECT status FROM public.poll_subscriptions WHERE id=sid)<>'declined' THEN RAISE EXCEPTION 'legacy withdrawal not refusal: %, %',r,(SELECT status FROM public.poll_subscriptions WHERE id=sid); END IF;
 IF public.polls_hub_subscription_cancel(sid)->>'ok'<>'false' THEN RAISE EXCEPTION 'repeat legacy withdrawal'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 -- Existing anonymous recipient registers: no conversion or manual friendship bypass.
 r:=public.subscribers_invite('register333@example.net'); sid:=(r->>'id')::uuid; tok:=(r->>'token')::uuid;
 IF NOT public.poll_go_sub_decline(tok) THEN RAISE EXCEPTION 'registration fixture'; END IF;
 UPDATE public.profiles SET email='register333@example.net' WHERE id=recipient;
 UPDATE auth.users SET email='register333@example.net' WHERE id=recipient;
 -- Include a legacy duplicate pending row: conversion must still honor history.
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(uid,'register333@example.net','pending');
 IF public.friends_invite('fixtureaccount333')->>'err'<>'cooldown' THEN RAISE EXCEPTION 'manual conversion bypass'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 IF public.friend_invites_from_subscriptions()->>'created'<>'0' THEN RAISE EXCEPTION 'automatic conversion bypass'; END IF;
 INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES(uid,recipient,'pending') RETURNING id INTO fid;
 IF public.friends_accept(fid)->>'err'<>'cooldown' THEN RAISE EXCEPTION 'pending conversion acceptance bypass'; END IF;
 IF public.poll_sub_accept(tok)->>'error'<>'already_closed' THEN RAISE EXCEPTION 'closed registration token'; END IF;
 SELECT token INTO tok FROM public.poll_subscriptions WHERE owner_id=uid AND subscriber_email='register333@example.net' AND status='pending';
 IF public.poll_sub_accept_email(tok,'register333@example.net')->>'error'<>'has_account'
 OR public.poll_sub_accept(tok)->>'error'<>'has_account'
 OR public.poll_go_resolve(tok)->>'friend_conversion_required' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'account subscription bypass'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 IF public.polls_hub_subscription_invite('register333@example.net')->>'err'<>'has_account'
 OR public.polls_hub_subscription_invite_a('register333@example.net')->>'err'<>'has_account' THEN RAISE EXCEPTION 'legacy invite account bypass'; END IF;
 IF has_function_privilege('anon','public._subscriber_close(uuid,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public._subscriber_refusal_until(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'private helpers exposed'; END IF;
END; $$;
ROLLBACK;
