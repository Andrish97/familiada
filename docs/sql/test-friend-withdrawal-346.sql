\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('friend:invite_after_reject','pair',2592000,true),('friend:invite','pair',432000,true),('friend:resend','pair',432000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3460-0000-0000-000000000001','a346@example.invalid'),
 ('bbbbbbbb-3460-0000-0000-000000000002','b346@example.invalid'),
 ('cccccccc-3460-0000-0000-000000000003','c346@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3460-0000-0000-000000000001','a346@example.invalid','fixturea346'),
 ('bbbbbbbb-3460-0000-0000-000000000002','b346@example.invalid','fixtureb346'),
 ('cccccccc-3460-0000-0000-000000000003','c346@example.invalid','fixturec346')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('dddddddd-3460-0000-0000-000000000004','aaaaaaaa-3460-0000-0000-000000000001','Independent346');
INSERT INTO public.question_base_shares(base_id,user_id,role) VALUES
 ('dddddddd-3460-0000-0000-000000000004','bbbbbbbb-3460-0000-0000-000000000002','viewer');
DO $$ DECLARE
 a uuid:='aaaaaaaa-3460-0000-0000-000000000001'; b uuid:='bbbbbbbb-3460-0000-0000-000000000002'; c uuid:='cccccccc-3460-0000-0000-000000000003';
 actor uuid; peer uuid; f uuid; tok uuid; r jsonb; stamp timestamptz; counter integer; new_id uuid;
BEGIN
 IF has_function_privilege('authenticated','public._friend_locked(uuid)','EXECUTE') THEN RAISE EXCEPTION 'private helper ACL'; END IF;
 FOR actor IN SELECT unnest(ARRAY[a,b]) LOOP
  peer:=CASE WHEN actor=a THEN b ELSE a END;
  INSERT INTO public.friendships(requester_id,addressee_id,status,accepted_at,email_send_count,email_sent_at)
  VALUES(a,b,'active',now(),1,now()) RETURNING id,token INTO f,tok;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  r:=public.friends_remove(f);
  IF r->>'action' IS DISTINCT FROM 'declined' OR public.are_friends(a,b) OR
  NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=f AND requester_id=a AND addressee_id=b AND decision_user_id=actor AND status='declined' AND token=tok AND email_send_count=1) THEN RAISE EXCEPTION 'withdrawal loses relationship provenance %',r; END IF;
  SELECT declined_at INTO stamp FROM public.friendships WHERE id=f;
  IF public.friends_remove(f)->>'ok'='true' OR (SELECT declined_at FROM public.friendships WHERE id=f) IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'repeat withdrawal changed epoch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.friends_list() WHERE id=f AND direction='incoming' AND status='declined') THEN RAISE EXCEPTION 'own refusal has wrong direction'; END IF;
  IF public.friends_token_info(tok)->>'addressee_matches_me' IS DISTINCT FROM 'true' OR public.poll_go_resolve(tok)->>'recipient_matches_me' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'actor token identity'; END IF;
  PERFORM set_config('request.jwt.claim.sub',peer::text,true);
  IF public.friends_undo_reject(f)->>'ok'='true' OR public.friends_accept(f)->>'ok'='true' THEN RAISE EXCEPTION 'peer changed refusal'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.friends_list() WHERE id=f AND direction='outgoing') THEN RAISE EXCEPTION 'peer refusal direction'; END IF;
  IF public.friends_resend(f)->>'err' IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'refusal reminder'; END IF;
  PERFORM set_config('request.jwt.claim.sub',c::text,true);
  IF public.friends_undo_reject(f)->>'ok'='true' OR public.friends_cancel(f)->>'ok'='true' THEN RAISE EXCEPTION 'foreign mutation'; END IF;
  UPDATE public.friendships SET declined_at=now()-interval '5 days' WHERE id=f;
  UPDATE public.mail_cooldowns SET next_allowed_at=now()+interval '25 days'
  WHERE action_key='friend:invite_after_reject' AND target_key IN ('pair:'||a||':'||b,'pair:'||b||':'||a);
  PERFORM set_config('request.jwt.claim.sub',peer::text,true);
  IF EXISTS(SELECT 1 FROM public.friends_list() WHERE id=f) THEN RAISE EXCEPTION 'peer refusal did not hide at5'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF public.friends_undo_reject(f)->>'ok' IS DISTINCT FROM 'true' OR public.are_friends(a,b) THEN RAISE EXCEPTION 'undo autoaccept'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.friends_list() WHERE id=f AND status='pending' AND direction='incoming') OR (public.badges_get()->>'friends_pending')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'pending actor/badge'; END IF;
  PERFORM public.friends_reject(f);
  IF (SELECT declined_at FROM public.friendships WHERE id=f) IS DISTINCT FROM now()-interval '5 days' OR
  EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='friend:invite_after_reject' AND target_key IN ('pair:'||a||':'||b,'pair:'||b||':'||a) AND next_allowed_at IS DISTINCT FROM now()+interval '25 days') THEN RAISE EXCEPTION 'undo/reject extended window'; END IF;
  PERFORM public.friends_undo_reject(f);
  INSERT INTO public.user_flags(user_id,email_notifications) VALUES(actor,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
  PERFORM set_config('request.jwt.claim.sub',peer::text,true);
  IF public.friends_resend(f)->>'mail_allowed' IS DISTINCT FROM 'false' OR (SELECT email_send_count FROM public.friendships WHERE id=f) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'muted reminder budget'; END IF;
  UPDATE public.user_flags SET email_notifications=true WHERE user_id=actor;
  IF public.friends_resend(f)->>'err' IS DISTINCT FROM 'cooldown' THEN RAISE EXCEPTION 'reverse sender bypasses5days'; END IF;
  UPDATE public.friendships SET email_sent_at=now()-interval '6 days' WHERE id=f;
  UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE action_key IN ('friend:invite','friend:resend') AND target_key IN ('pair:'||a||':'||b,'pair:'||b||':'||a);
  r:=public.friends_resend(f);
  IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'to' IS DISTINCT FROM (CASE WHEN actor=a THEN 'a346@example.invalid' ELSE 'b346@example.invalid' END) OR (r->>'token')::uuid IS DISTINCT FROM tok THEN RAISE EXCEPTION 'reverse sender recipient/token %',r; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  r:=public.friends_accept(f);
  IF r->>'ok' IS DISTINCT FROM 'true' OR NOT public.are_friends(a,b) THEN RAISE EXCEPTION 'actor explicit accept %',r; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id='dddddddd-3460-0000-0000-000000000004' AND user_id=b) THEN RAISE EXCEPTION 'withdrawal revoked independent base'; END IF;
  PERFORM public.friends_remove(f);
  PERFORM set_config('request.jwt.claim.sub',peer::text,true);
  IF public.friends_cancel(f)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'other party cannot revoke'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF public.friends_undo_reject(f)->>'ok'='true' OR public.friends_token_info(tok)->>'ok'='true' OR public.poll_go_resolve(tok)->>'ok'='true' THEN RAISE EXCEPTION 'cancelled token/undo usable'; END IF;
  FOR r IN SELECT public.friends_invite(CASE WHEN actor=a THEN 'fixtureb346' ELSE 'fixturea346' END) LOOP
   IF r->>'reason' IS DISTINCT FROM 'after_reject' THEN RAISE EXCEPTION 'cancel erased refusal %',r; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',peer::text,true);
  r:=public.friends_invite(CASE WHEN peer=a THEN 'fixtureb346' ELSE 'fixturea346' END);
  IF r->>'reason' IS DISTINCT FROM 'after_reject' THEN RAISE EXCEPTION 'cancel reverse erased refusal %',r; END IF;
  UPDATE public.friendships SET declined_at=now()-interval '30 days' WHERE id=f;
  UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE action_key='friend:invite_after_reject' AND target_key IN ('pair:'||a||':'||b,'pair:'||b||':'||a);
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  r:=public.friends_invite('fixtureb346');
  IF r->>'reason' IS DISTINCT FROM 'mail_limit' THEN RAISE EXCEPTION 'expiry lost2/30 budget %',r; END IF;
  INSERT INTO public.user_flags(user_id,email_notifications) VALUES(b,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
  r:=public.friends_invite('fixtureb346');new_id:=(r->>'id')::uuid;
  IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'mail_allowed' IS DISTINCT FROM 'false' OR (r->>'token')::uuid=tok OR
  NOT EXISTS(SELECT 1 FROM public.friendships WHERE id=new_id AND email_send_count=2) THEN RAISE EXCEPTION 'fresh muted invite reset budget %',r; END IF;
  IF public.friends_token_info(tok)->>'ok'='true' THEN RAISE EXCEPTION 'old token revived'; END IF;
  DELETE FROM public.friendships WHERE id=new_id;
  DELETE FROM public.mail_cooldowns WHERE target_key IN ('pair:'||a||':'||b,'pair:'||b||':'||a);
  UPDATE public.user_flags SET email_notifications=true WHERE user_id IN (a,b);
 END LOOP;
END $$;
ROLLBACK;
