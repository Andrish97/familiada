\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('base:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3370-0000-0000-000000000001','owner337@example.net'),
 ('bbbbbbbb-3370-0000-0000-000000000002','recipient337@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3370-0000-0000-000000000001','owner337@example.net','owner337'),
 ('bbbbbbbb-3370-0000-0000-000000000002','recipient337@example.net','recipient337')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('cccccccc-3370-0000-0000-000000000003','aaaaaaaa-3370-0000-0000-000000000001','Base337');
DO $$ DECLARE owner_id uuid:='aaaaaaaa-3370-0000-0000-000000000001';
 recipient uuid:='bbbbbbbb-3370-0000-0000-000000000002';
 bid uuid:='cccccccc-3370-0000-0000-000000000003';
 r record; t uuid; stamp timestamptz; j jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 SELECT * INTO r FROM public.base_share_by_user(bid,recipient,'viewer');
 IF NOT r.ok OR r.mail_to<>'recipient337@example.net' THEN RAISE EXCEPTION 'initial invite %',to_jsonb(r); END IF;
 SELECT id INTO t FROM public.base_share_tasks WHERE base_id=bid AND status='pending';
 IF public.base_share_panel(bid)->'outgoing'->0->>'status'<>'pending' OR jsonb_array_length(public.base_share_panel(bid)->'active')<>0 THEN RAISE EXCEPTION 'panel pending metadata'; END IF;
 IF public.base_share_resend(t)->>'err'<>'cooldown' THEN RAISE EXCEPTION 'immediate resend'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 IF NOT public.base_share_decline(t) THEN RAISE EXCEPTION 'decline'; END IF;
 SELECT declined_at INTO stamp FROM public.base_share_tasks WHERE id=t;
 IF public.base_share_accept(t) THEN RAISE EXCEPTION 'accept skips undo'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 SELECT * INTO r FROM public.base_share_by_email(bid,' RECIPIENT337@EXAMPLE.NET ','editor');
 IF r.err<>'declined' THEN RAISE EXCEPTION 'email bypass %',to_jsonb(r); END IF;
 IF public.base_share_resend(t)->>'err'<>'not_pending' THEN RAISE EXCEPTION 'declined reminder'; END IF;
 IF public.base_share_panel(bid)->'outgoing'->0->>'status'<>'declined' THEN RAISE EXCEPTION 'panel refused metadata'; END IF;
 IF public.base_share_undo_decline(t)->>'err'<>'not_found' THEN RAISE EXCEPTION 'sender undo'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 j:=public.base_share_undo_decline(t);
 IF j->>'ok'<>'true' OR (SELECT declined_at FROM public.base_share_tasks WHERE id=t) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'undo resets decision'; END IF;
 IF NOT public.base_share_accept(t) THEN RAISE EXCEPTION 'accept after undo'; END IF;
 IF (SELECT role FROM public.question_base_shares WHERE base_id=bid AND user_id=recipient)<>'viewer' THEN RAISE EXCEPTION 'initial role'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 SELECT * INTO r FROM public.update_base_share_role(bid,recipient,'editor');
 IF public.base_share_panel(bid)->'active'->0->>'role'<>'editor' OR jsonb_array_length(public.base_share_panel(bid)->'outgoing')<>0 THEN RAISE EXCEPTION 'panel active metadata'; END IF;
 IF NOT r.ok OR (SELECT role FROM public.question_base_shares WHERE base_id=bid AND user_id=recipient)<>'editor' THEN RAISE EXCEPTION 'role must update actual shares %',to_jsonb(r); END IF;
 SELECT * INTO r FROM public.base_share_by_user(bid,recipient,'viewer');
 IF r.err<>'already_active' OR (SELECT role FROM public.question_base_shares WHERE base_id=bid AND user_id=recipient)<>'editor' THEN RAISE EXCEPTION 'duplicate changed role'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 IF NOT public.leave_shared_base(bid) THEN RAISE EXCEPTION 'leave active base'; END IF;
 IF EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id=bid AND user_id=recipient)
 OR (SELECT status FROM public.base_share_tasks WHERE id=t)<>'declined'
 OR (SELECT declined_at FROM public.base_share_tasks WHERE id=t) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'leave not refusal or reset'; END IF;
 IF public.leave_shared_base(bid) THEN RAISE EXCEPTION 'duplicate leave'; END IF;
 IF public.base_declines_list_mine()->0->>'role'<>'editor' THEN RAISE EXCEPTION 'leave role not current'; END IF;
 PERFORM public.base_share_undo_decline(t);
 IF NOT public.base_share_accept(t) THEN RAISE EXCEPTION 'undo leave acceptance'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 IF NOT public.revoke_base_share(bid,recipient) THEN RAISE EXCEPTION 'revoke'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 IF public.base_share_undo_decline(t)->>'ok'<>'false' OR public.base_share_accept(t) THEN RAISE EXCEPTION 'revocation undone'; END IF;
END $$;
ROLLBACK;
