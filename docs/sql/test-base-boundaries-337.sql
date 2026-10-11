\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES ('base:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3371-0000-0000-000000000001','owner337b@example.net'),
 ('bbbbbbbb-3371-0000-0000-000000000002','recipient337b@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3371-0000-0000-000000000001','owner337b@example.net','owner337b'),
 ('bbbbbbbb-3371-0000-0000-000000000002','recipient337b@example.net','recipient337b')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('cccccccc-3371-0000-0000-000000000003','aaaaaaaa-3371-0000-0000-000000000001','Boundary337');
DO $$ DECLARE o uuid:='aaaaaaaa-3371-0000-0000-000000000001';
 u uuid:='bbbbbbbb-3371-0000-0000-000000000002';
 b uuid:='cccccccc-3371-0000-0000-000000000003'; t uuid; tok uuid; r record;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='question_base_shares' AND policyname='qb_shares_write') THEN RAISE EXCEPTION 'direct table write bypass'; END IF;
 IF has_function_privilege('anon','public.base_share_accept(uuid)','EXECUTE') OR has_function_privilege('anon','public.base_share_decline(uuid)','EXECUTE') OR has_function_privilege('authenticated','public._base_share_refusal_until(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'ACL'; END IF;
 IF has_function_privilege('authenticated','public.share_base_by_email(uuid,text,public.base_share_role)','EXECUTE') THEN RAISE EXCEPTION 'legacy direct-access bypass remains'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 SELECT * INTO r FROM public.base_share_by_user(b,u,'viewer');
 IF NOT r.ok THEN RAISE EXCEPTION 'invite %',to_jsonb(r); END IF;
 SELECT id,token INTO t,tok FROM public.base_share_tasks WHERE base_id=b;
 UPDATE public.base_share_tasks SET created_at=now()-interval '5 days' WHERE id=t;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF public.base_share_accept(t) OR public.base_share_decline(t) THEN RAISE EXCEPTION '5 day boundary accepts decision'; END IF;
 IF EXISTS(SELECT 1 FROM public.base_share_token_info(tok::text)) THEN RAISE EXCEPTION 'expired token visible'; END IF;
 UPDATE public.base_share_tasks SET created_at=now(),status='declined',declined_at=now()-interval '5 days' WHERE id=t;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 IF EXISTS(SELECT 1 FROM public.list_base_share_tasks_outgoing(b)) THEN RAISE EXCEPTION 'sender sees exact 5 day decline'; END IF;
 SELECT * INTO r FROM public.base_share_by_user(b,u,'editor');
 IF r.err<>'declined' THEN RAISE EXCEPTION 'hidden refusal can bypass %',to_jsonb(r); END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF jsonb_array_length(public.base_declines_list_mine())<>1 THEN RAISE EXCEPTION 'own hidden refusal disappeared'; END IF;
 UPDATE public.base_share_tasks SET declined_at=now()-interval '30 days' WHERE id=t;
 IF public.base_share_undo_decline(t)->>'err'<>'expired' THEN RAISE EXCEPTION 'undo exact 30 days'; END IF;
 IF jsonb_array_length(public.base_declines_list_mine())<>0 THEN RAISE EXCEPTION 'own expired refusal visible'; END IF;
 IF EXISTS(SELECT 1 FROM public.base_share_token_info(tok::text)) THEN RAISE EXCEPTION 'expired declined token visible'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE target_key='pair:'||o||':'||u||':base:'||b;
 SELECT * INTO r FROM public.base_share_by_user(b,u,'editor');
 IF NOT r.ok OR EXISTS(SELECT 1 FROM public.base_share_tasks WHERE token=tok) THEN RAISE EXCEPTION '30 day new invitation %',to_jsonb(r); END IF;
 SELECT id INTO t FROM public.base_share_tasks WHERE base_id=b;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF public.base_share_update_invite_role(t,'viewer')->>'ok'<>'false' THEN RAISE EXCEPTION 'recipient changed pending role'; END IF;
 IF public.base_share_cancel_task(t) THEN RAISE EXCEPTION 'recipient cancelled as sender'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 IF public.base_share_update_invite_role(t,'viewer')->>'ok'<>'true' THEN RAISE EXCEPTION 'sender role change'; END IF;
 IF NOT public.base_share_cancel_task(t) THEN RAISE EXCEPTION 'cancel pending'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF public.base_share_accept(t) OR public.base_share_decline(t) OR public.base_share_undo_decline(t)->>'ok'<>'false' THEN RAISE EXCEPTION 'cancelled task action'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE target_key='pair:'||o||':'||u||':base:'||b;
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(u,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 SELECT * INTO r FROM public.base_share_by_user(b,u,'viewer');
 IF NOT r.ok OR r.mail_to IS NOT NULL THEN RAISE EXCEPTION 'flag-off invite %',to_jsonb(r); END IF;
 SELECT id INTO t FROM public.base_share_tasks WHERE base_id=b AND status='pending';
 IF public.base_share_resend(t)->>'mail_allowed'<>'false' OR
 (SELECT email_send_count FROM public.base_share_tasks WHERE id=t)<>0 OR
 (SELECT email_sent_at FROM public.base_share_tasks WHERE id=t) IS NOT NULL OR
 EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='base:share' AND target_key='pair:'||o||':'||u||':base:'||b AND next_allowed_at>now()) THEN RAISE EXCEPTION 'flag-off charges counters/clocks'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF NOT public.base_share_accept(t) THEN RAISE EXCEPTION 'flag-off hides access acceptance'; END IF;
 IF public.base_share_panel(b)->>'ok'<>'false' THEN RAISE EXCEPTION 'recipient reads owner panel'; END IF;
END $$;
ROLLBACK;
