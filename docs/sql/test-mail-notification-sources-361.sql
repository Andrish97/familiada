BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('base:share','pair',0,false) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3610-0000-0000-000000000001','owner361@example.invalid',false,now(),'{"username":"owner361"}'),
 ('bbbbbbbb-3610-0000-0000-000000000002','receiver361@example.invalid',false,now(),'{"username":"receiver361"}');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3610-0000-0000-000000000003','aaaaaaaa-3610-0000-0000-000000000001','Source361','poll_text','poll_open','key361');
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('dddddddd-3610-0000-0000-000000000004','aaaaaaaa-3610-0000-0000-000000000001','Base361');
DO $$ DECLARE owner_id uuid:='aaaaaaaa-3610-0000-0000-000000000001'; peer uuid:='bbbbbbbb-3610-0000-0000-000000000002';
 game_id uuid:='cccccccc-3610-0000-0000-000000000003'; base_id uuid:='dddddddd-3610-0000-0000-000000000004';
 f public.friendships; s public.poll_subscriptions; t public.poll_tasks; b public.base_share_tasks; d public.control_device_shares;
 session_id uuid; kind text; q public.mail_queue; bad public.mail_queue; info jsonb; queue_id uuid;
BEGIN
 INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status) VALUES(owner_id,peer,peer,'pending') RETURNING * INTO f;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(owner_id,'anonymous361@example.invalid','pending') RETURNING * INTO s;
 INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status) VALUES(owner_id,peer,game_id,'poll_text','key361','pending') RETURNING * INTO t;
 INSERT INTO public.base_share_tasks(owner_id,recipient_user_id,base_id,role,status) VALUES(owner_id,peer,base_id,'viewer','pending') RETURNING * INTO b;
 INSERT INTO public.control_runtime_sessions(owner_id,game_id) VALUES(owner_id,game_id) RETURNING id INTO session_id;
 INSERT INTO public.control_device_shares(owner_id,recipient_id,session_id,game_id,device_type) VALUES(owner_id,peer,session_id,game_id,'display') RETURNING * INTO d;
 FOREACH kind IN ARRAY ARRAY['friend','subscription','poll','base','device'] LOOP
  q:=jsonb_populate_record(NULL::public.mail_queue,jsonb_build_object('created_by',owner_id,'to_email',CASE WHEN kind='subscription' THEN 'anonymous361@example.invalid' ELSE 'receiver361@example.invalid' END,'notification_source_kind',kind,'cooldown_action_key',CASE kind WHEN 'friend' THEN 'friend:invite' WHEN 'subscription' THEN 'poll:invite' WHEN 'poll' THEN 'poll:share' WHEN 'base' THEN 'base:share' ELSE 'device:share' END));
  CASE kind
   WHEN 'friend' THEN q.notification_source_token:=f.token;q.notification_friendship_id:=f.id;
   WHEN 'subscription' THEN q.notification_source_token:=s.token;q.notification_subscription_id:=s.id;
   WHEN 'poll' THEN q.notification_source_token:=t.token;q.notification_poll_task_id:=t.id;
   WHEN 'base' THEN q.notification_source_token:=b.token;q.notification_base_task_id:=b.id;
   WHEN 'device' THEN q.notification_source_token:=d.token;q.notification_device_share_id:=d.id;
  END CASE;
  info:=public._mail_notification_source_info_prototype(q);
  q.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(q.to_email));
  IF NOT public._mail_notification_source_live_prototype(q) THEN RAISE EXCEPTION 'live source rejected: % %',kind,info; END IF;
  bad:=q;bad.to_email:='foreign361@example.invalid';IF public._mail_notification_source_live_prototype(bad) THEN RAISE EXCEPTION 'foreign mailbox accepted: %',kind; END IF;
  bad:=q;bad.created_by:=peer;IF public._mail_notification_source_live_prototype(bad) THEN RAISE EXCEPTION 'foreign sender accepted: %',kind; END IF;
  bad:=q;bad.notification_snapshot:=NULL;IF public._mail_notification_source_live_prototype(bad) THEN RAISE EXCEPTION 'unbound historical row guessed: %',kind; END IF;
  bad:=q;bad.notification_source_token:=gen_random_uuid();IF public._mail_notification_source_live_prototype(bad) THEN RAISE EXCEPTION 'wrong source token accepted: %',kind; END IF;
  bad:=q;bad.cooldown_action_key:='admin:compose';IF public._mail_notification_source_live_prototype(bad) THEN RAISE EXCEPTION 'source/action mismatch accepted: %',kind; END IF;
  CASE kind
   WHEN 'friend' THEN UPDATE public.friendships SET status='active',accepted_at=now() WHERE id=f.id;
   WHEN 'subscription' THEN UPDATE public.poll_subscriptions SET status='active',accepted_at=now() WHERE id=s.id;
   WHEN 'poll' THEN UPDATE public.games SET share_key_poll='new-key361' WHERE id=game_id;
   WHEN 'base' THEN UPDATE public.base_share_tasks SET role='editor' WHERE id=b.id;
   WHEN 'device' THEN UPDATE public.control_runtime_sessions SET expires_at=now()-interval '1 second' WHERE id=session_id;
  END CASE;
  IF public._mail_notification_source_live_prototype(q) THEN RAISE EXCEPTION 'changed/closed parent or role remained deliverable: %',kind; END IF;
 END LOOP;
 -- A stored FK stays invalid after deletion, even if a token is later reused.
 UPDATE public.base_share_tasks SET role='viewer' WHERE id=b.id;
 q:=jsonb_populate_record(NULL::public.mail_queue,jsonb_build_object('created_by',owner_id,'to_email','receiver361@example.invalid','notification_source_kind','base','cooldown_action_key','base:share','notification_source_token',b.token,'notification_base_task_id',b.id));
 info:=public._mail_notification_source_info_prototype(q);
 q.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',peer,'identity_id',peer);
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token,notification_base_task_id,notification_snapshot)
  VALUES(owner_id,q.to_email,'Fixture','Fixture','base:share','fixture','base',b.token,b.id,q.notification_snapshot) RETURNING id INTO queue_id;
 SELECT * INTO q FROM public.mail_queue WHERE id=queue_id;
 DELETE FROM public.base_share_tasks WHERE id=b.id;
 INSERT INTO public.base_share_tasks(owner_id,recipient_user_id,base_id,role,status,token) VALUES(owner_id,peer,base_id,'viewer','pending',b.token);
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=queue_id) OR public._mail_notification_source_live_prototype(q) THEN RAISE EXCEPTION 'deleted source rebound from body/token'; END IF;
 IF has_function_privilege('authenticated','public._mail_notification_source_info_prototype(public.mail_queue)','EXECUTE')
  OR has_function_privilege('anon','public._mail_notification_source_live_prototype(public.mail_queue)','EXECUTE') THEN RAISE EXCEPTION 'public source inspection'; END IF;
 RAISE NOTICE 'five source families, canonical owner/recipient, snapshot/session/role changes, FK deletion without guessing and ACL passed';
END $$;
ROLLBACK;
