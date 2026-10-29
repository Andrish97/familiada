\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3390-0000-0000-000000000001','owner339@example.net'),
 ('bbbbbbbb-3390-0000-0000-000000000002','recipient339@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3390-0000-0000-000000000001','owner339@example.net','owner339'),
 ('bbbbbbbb-3390-0000-0000-000000000002','recipient339@example.net','recipient339')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES('aaaaaaaa-3390-0000-0000-000000000001','bbbbbbbb-3390-0000-0000-000000000002','active');
INSERT INTO public.question_bases(id,owner_id,name) VALUES('cccccccc-3390-0000-0000-000000000003','aaaaaaaa-3390-0000-0000-000000000001','Availability339');
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('base:share','pair',86400,true) ON CONFLICT DO NOTHING;
DO $$ DECLARE o uuid:='aaaaaaaa-3390-0000-0000-000000000001'; u uuid:='bbbbbbbb-3390-0000-0000-000000000002'; b uuid:='cccccccc-3390-0000-0000-000000000003'; j jsonb; r record; t uuid; BEGIN
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 PERFORM public.mail_cooldown_reserve('base:share','pair:'||o||':'||u||':base:'||b);
 j:=public.base_share_panel(b)->'friends'->0;
 IF j IS NULL OR j->>'email_enabled' IS DISTINCT FROM 'true' OR j->>'cooldown_until' IS NULL THEN RAISE EXCEPTION 'enabled metadata %',j; END IF;
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(u,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 j:=public.base_share_panel(b)->'friends'->0;
 IF j->>'email_enabled' IS DISTINCT FROM 'false' OR j->>'cooldown_until' IS NOT NULL THEN RAISE EXCEPTION 'muted recipient blocked by mail clock %',j; END IF;
 SELECT * INTO r FROM public.base_share_by_user(b,u,'viewer');
 IF r.ok IS DISTINCT FROM true OR r.mail_to IS NOT NULL THEN RAISE EXCEPTION 'muted recipient cannot receive access %',to_jsonb(r); END IF;
 SELECT id INTO t FROM public.base_share_tasks WHERE base_id=b;
 IF EXISTS(SELECT 1 FROM public.base_share_tasks WHERE id=t AND (email_send_count<>0 OR email_sent_at IS NOT NULL)) THEN RAISE EXCEPTION 'muted counters'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF NOT public.base_share_decline(t) THEN RAISE EXCEPTION 'muted decline'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 j:=public.base_share_panel(b)->'friends'->0;
 IF j->>'email_enabled' IS DISTINCT FROM 'false' OR j->>'cooldown_until' IS NULL THEN RAISE EXCEPTION 'muted refusal bypass %',j; END IF;
 SELECT * INTO r FROM public.base_share_by_user(b,u,'viewer');
 IF r.err IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'muted bypasses refusal %',to_jsonb(r); END IF;
END $$;
ROLLBACK;
