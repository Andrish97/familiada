BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
 SELECT k,'pair',0,false FROM unnest(ARRAY['friend:invite','poll:resend','poll:share','base:share','device:share','baseline:recipient']) k
 ON CONFLICT(action_key) DO UPDATE SET cooldown_seconds=0,enforce=false;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3614-0000-0000-000000000001','ownerepoch361@example.invalid',false,now(),'{"username":"ownerepoch361"}'),
 ('bbbbbbbb-3614-0000-0000-000000000002','peerepoch361@example.invalid',false,now(),'{"username":"peerepoch361"}');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3614-0000-0000-000000000003','aaaaaaaa-3614-0000-0000-000000000001','Epoch361','poll_text','poll_open','epoch361');
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('dddddddd-3614-0000-0000-000000000004','aaaaaaaa-3614-0000-0000-000000000001','EpochBase361');
DO $$ DECLARE v_owner uuid:='aaaaaaaa-3614-0000-0000-000000000001';v_peer uuid:='bbbbbbbb-3614-0000-0000-000000000002';
 v_game uuid:='cccccccc-3614-0000-0000-000000000003';v_base uuid:='dddddddd-3614-0000-0000-000000000004';
 f uuid;s uuid;t uuid;b uuid;d uuid;session_id uuid;source_id uuid;kind text;action text;allocation_id uuid;queue_id uuid;
 a public.mail_notification_allocations_prototype; result jsonb; actor_role text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
 INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status) VALUES(v_owner,v_peer,v_peer,'pending') RETURNING id INTO f;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(v_owner,'anonepoch361@example.invalid','pending') RETURNING id INTO s;
 INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status) VALUES(v_owner,v_peer,v_game,'poll_text','epoch361','pending') RETURNING id INTO t;
 INSERT INTO public.base_share_tasks(owner_id,recipient_user_id,base_id,role,status) VALUES(v_owner,v_peer,v_base,'viewer','pending') RETURNING id INTO b;
 INSERT INTO public.control_runtime_sessions(owner_id,game_id) VALUES(v_owner,v_game) RETURNING id INTO session_id;
 INSERT INTO public.control_device_shares(owner_id,recipient_id,session_id,game_id,device_type) VALUES(v_owner,v_peer,session_id,v_game,'display') RETURNING id INTO d;
 -- Private grants here are isolated fixtures for each graph edge, not a public
 -- bypass. Real budget-reserving producers are covered by delivery-361.
 FOREACH kind IN ARRAY ARRAY['friend','subscription','base','device','poll'] LOOP
  source_id:=CASE kind WHEN 'friend' THEN f WHEN 'subscription' THEN s WHEN 'poll' THEN t WHEN 'base' THEN b ELSE d END;
  action:=CASE kind WHEN 'friend' THEN 'friend:invite' WHEN 'subscription' THEN 'poll:resend' WHEN 'poll' THEN 'poll:share' WHEN 'base' THEN 'base:share' ELSE 'device:share' END;
  allocation_id:=public._mail_allocate_notification_prototype(kind,source_id,action);
  IF allocation_id IS NULL THEN RAISE EXCEPTION 'fixture not live %',kind; END IF;
  UPDATE public.mail_notification_allocations_prototype SET enqueue_before=now()-interval '1 second' WHERE id=allocation_id;
  BEGIN
   SELECT * INTO a FROM public.mail_notification_allocations_prototype WHERE id=allocation_id;
   INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token,meta)
    VALUES(v_owner,a.to_email,'Expired','Fixture',action,'fixture',kind,a.source_token,jsonb_build_object('notification_reference',a.snapshot->'resource'));
   RAISE EXCEPTION 'expired enqueue permission accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_notification_attempt' THEN RAISE; END IF; END;
  allocation_id:=public._mail_allocate_notification_prototype(kind,source_id,action);
  SELECT * INTO a FROM public.mail_notification_allocations_prototype WHERE id=allocation_id;
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token,meta)
   VALUES(v_owner,a.to_email,'Fixture','Fixture',action,'fixture',kind,a.source_token,jsonb_build_object('notification_reference',a.snapshot->'resource')) RETURNING id INTO queue_id;
  -- Enqueue deadline expires only unused permission; queued mail stays valid.
  UPDATE public.mail_notification_allocations_prototype SET enqueue_before=now()-interval '1 second' WHERE id=allocation_id;
  IF NOT public._mail_notification_queue_live_prototype((SELECT q FROM public.mail_queue q WHERE q.id=queue_id)) THEN RAISE EXCEPTION 'enqueue deadline became delivery TTL'; END IF;
  -- Muting the sender's incoming mail never cancels outgoing invitations.
  UPDATE public.user_flags SET email_notifications=false WHERE user_id=v_owner;
  IF EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE id=allocation_id AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'sender preference cancelled outgoing mail %',kind; END IF;
  UPDATE public.user_flags SET email_notifications=true WHERE user_id=v_owner;
  UPDATE auth.users SET email='temporaryowner361@example.invalid' WHERE id=v_owner;
  UPDATE auth.users SET email='ownerepoch361@example.invalid' WHERE id=v_owner;
  UPDATE public.profiles SET email='untrustedalias361@example.invalid' WHERE id=v_peer;
  UPDATE public.profiles SET email='peerepoch361@example.invalid' WHERE id=v_peer;
  IF EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE id=allocation_id AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'sender address or profile alias invalidated canonical recipient mail'; END IF;
  IF kind='subscription' THEN
   PERFORM public._ensure_unsub_token(a.to_email);
   UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email=a.to_email;
   UPDATE public.email_unsub_tokens SET suppressed_at=NULL WHERE email=a.to_email;
  ELSE
   UPDATE public.user_flags SET email_notifications=false WHERE user_id=v_peer;
   UPDATE public.user_flags SET email_notifications=true WHERE user_id=v_peer;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE id=allocation_id AND revoked_at IS NOT NULL)
   OR public._mail_notification_queue_live_prototype((SELECT q FROM public.mail_queue q WHERE q.id=queue_id)) THEN RAISE EXCEPTION 'restoration revived muted queue %',kind; END IF;
  IF kind='subscription' THEN
   IF public._mail_notification_source_live_prototype(public._mail_notification_probe_prototype(kind,source_id,action)) IS DISTINCT FROM true THEN RAISE EXCEPTION 'root restore also blocked fresh permitted sources'; END IF;
  END IF;
  allocation_id:=public._mail_allocate_notification_prototype(kind,source_id,action);
  SELECT * INTO a FROM public.mail_notification_allocations_prototype WHERE id=allocation_id;
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token,meta)
   VALUES(v_owner,a.to_email,'Fresh','Fixture',action,'fixture',kind,a.source_token,jsonb_build_object('notification_reference',a.snapshot->'resource')) RETURNING id INTO queue_id;
  IF kind IN('poll','device') THEN
   IF kind='poll' THEN UPDATE public.games SET share_key_poll='changed361' WHERE id=v_game; UPDATE public.games SET share_key_poll='epoch361' WHERE id=v_game;
   ELSE UPDATE public.control_runtime_sessions SET ended_at=now() WHERE id=session_id;UPDATE public.control_runtime_sessions SET ended_at=NULL WHERE id=session_id; END IF;
  ELSIF kind IN('friend','base') THEN
   UPDATE auth.users SET email='temporaryepoch361@example.invalid' WHERE id=v_peer;
   UPDATE auth.users SET email='peerepoch361@example.invalid' WHERE id=v_peer;
  ELSE
   UPDATE public.poll_subscriptions SET subscriber_email='temporaryanon361@example.invalid' WHERE id=s;
   UPDATE public.poll_subscriptions SET subscriber_email='anonepoch361@example.invalid' WHERE id=s;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE id=allocation_id AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'identity/parent restoration revived permission %',kind; END IF;
  CASE kind
   WHEN 'friend' THEN DELETE FROM public.friendships WHERE id=f;
   WHEN 'subscription' THEN DELETE FROM public.poll_subscriptions WHERE id=s;
   WHEN 'poll' THEN DELETE FROM public.games WHERE id=v_game;
   WHEN 'base' THEN DELETE FROM public.question_bases WHERE id=v_base;
   WHEN 'device' THEN DELETE FROM public.control_runtime_sessions WHERE id=session_id;
  END CASE;
  IF EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE id=allocation_id)
   OR EXISTS(SELECT 1 FROM public.mail_queue WHERE id=queue_id) THEN RAISE EXCEPTION 'source parent deletion did not cascade to queue %',kind; END IF;
 END LOOP;
 RAISE NOTICE 'five families: enqueue TTL, delivery lifetime, sender vs recipient flag, restoration epoch, identity/parent changes, hard-delete cascade passed';
END $$;
ROLLBACK;
