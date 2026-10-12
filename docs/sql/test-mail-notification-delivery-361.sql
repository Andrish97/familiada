BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
 SELECT k,'pair',0,false FROM unnest(ARRAY['friend:invite','friend:resend','poll:invite','poll:resend','poll:share','base:share','device:share','baseline:recipient']) k
 ON CONFLICT(action_key) DO UPDATE SET cooldown_seconds=0,enforce=false;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3613-0000-0000-000000000001','ownerdelivery361@example.invalid',false,now(),'{"username":"ownerdelivery361"}'),
 ('bbbbbbbb-3613-0000-0000-000000000002','peerdelivery361@example.invalid',false,now(),'{"username":"peerdelivery361"}'),
 ('bbbbbbbb-3613-0000-0000-000000000003','frienddelivery361@example.invalid',false,now(),'{"username":"frienddelivery361"}');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3613-0000-0000-000000000003','aaaaaaaa-3613-0000-0000-000000000001','Delivery361','poll_text','poll_open','delivery361');
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('dddddddd-3613-0000-0000-000000000004','aaaaaaaa-3613-0000-0000-000000000001','DeliveryBase361');
CREATE FUNCTION pg_temp.enqueue361(a public.mail_notification_allocations_prototype)
RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE queue_id uuid; BEGIN
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token,meta)
 VALUES(a.owner_id,a.to_email,'Source fixture','Source fixture',CASE a.source_kind WHEN 'friend' THEN 'friend:invite' WHEN 'subscription' THEN 'poll:resend'
  WHEN 'poll' THEN 'poll:share' WHEN 'base' THEN 'base:share' ELSE 'device:share' END,'fixture',a.source_kind,a.source_token,
  jsonb_build_object('notification_reference',a.snapshot->'resource')) RETURNING id INTO queue_id;
 RETURN queue_id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE owner_id uuid:='aaaaaaaa-3613-0000-0000-000000000001'; peer uuid:='bbbbbbbb-3613-0000-0000-000000000002';
 game_id uuid:='cccccccc-3613-0000-0000-000000000003'; base_id uuid:='dddddddd-3613-0000-0000-000000000004';
 friend_id uuid; sub_id uuid; result jsonb; response record; a public.mail_notification_allocations_prototype; q public.mail_queue;
 queue_ids uuid[]:='{}'; queue_id uuid; affected integer; source_id uuid; device_session uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 result:=public.friends_invite('frienddelivery361');
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'friend producer failed %',result; END IF;
 INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status,accepted_at) VALUES(owner_id,peer,peer,'active',now()) RETURNING id INTO friend_id;
 result:=public.subscribers_invite('anonymousdelivery361@example.invalid'); sub_id:=(result->>'id')::uuid;
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'subscription producer failed %',result; END IF;
 result:=public.polls_hub_subscriber_resend(sub_id);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'subscription mail reservation failed %',result; END IF;
 result:=public.poll_share_send(game_id,ARRAY[peer],'{}');
 IF result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(result->'mail')<>1 THEN RAISE EXCEPTION 'poll producer failed %',result; END IF;
 SELECT * INTO response FROM public.base_share_to_friend(base_id,peer,'viewer');
 IF response.ok IS DISTINCT FROM true OR response.mail_to IS NULL THEN RAISE EXCEPTION 'base producer failed %',to_jsonb(response); END IF;
 INSERT INTO public.control_runtime_sessions(owner_id,game_id) VALUES(owner_id,game_id);
 result:=public.control_device_share_create(game_id,'display',peer,NULL);
 IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'mail_allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'device producer failed %',result; END IF;
 IF (SELECT count(*) FROM public.mail_notification_allocations_prototype WHERE lifecycle_owner_id=owner_id AND revoked_at IS NULL)<>5 THEN
  RAISE EXCEPTION 'five real resource producers did not mint five permissions'; END IF;
 FOR a IN SELECT * FROM public.mail_notification_allocations_prototype WHERE lifecycle_owner_id=owner_id AND revoked_at IS NULL ORDER BY source_kind LOOP
  queue_id:=pg_temp.enqueue361(a);queue_ids:=array_append(queue_ids,queue_id);
  SELECT * INTO q FROM public.mail_queue WHERE id=queue_id;
  IF NOT public._mail_notification_queue_live_prototype(q) THEN RAISE EXCEPTION 'valid bound queue rejected: %',a.source_kind; END IF;
  IF a.source_kind='poll' THEN UPDATE public.mail_queue SET not_before=now()+interval '1 hour' WHERE id=queue_id; END IF;
 END LOOP;
 SELECT count(*) INTO affected FROM public.mail_queue_pick_selected(queue_ids,25);
 IF affected<>4 THEN RAISE EXCEPTION 'selected claim ignores source eligibility or future delay: %',affected; END IF;
 FOR q IN SELECT * FROM public.mail_queue WHERE id=ANY(queue_ids) AND status='sending' LOOP
  result:=public.mail_queue_delivery_context_prototype(q.id);
  IF result->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'valid source not deliverable: % %',q.notification_source_kind,result; END IF;
 END LOOP;
 IF public.mail_queue_requeue(queue_ids,false)<>1 OR EXISTS(SELECT 1 FROM public.mail_queue WHERE id=ANY(queue_ids) AND notification_source_kind<>'poll' AND status<>'sending') THEN
  RAISE EXCEPTION 'requeue stole active delivery lease'; END IF;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=ANY(queue_ids) AND notification_source_kind='poll' AND not_before<now()+interval '59 minutes') THEN RAISE EXCEPTION 'requeue removed future delay'; END IF;
 -- pending/opened is a single active group, not a source replacement.
 UPDATE public.poll_tasks SET status='opened',opened_at=now() WHERE poll_tasks.owner_id=owner_id AND poll_tasks.game_id=game_id;
 UPDATE public.base_share_tasks SET status='opened',opened_at=now() WHERE base_share_tasks.owner_id=owner_id AND base_share_tasks.base_id=base_id;
 IF EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE lifecycle_owner_id=owner_id AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'opening an invitation invalidated its mail'; END IF;
 FOR q IN SELECT * FROM public.mail_queue WHERE id=ANY(queue_ids) ORDER BY notification_source_kind LOOP
  CASE q.notification_source_kind
   WHEN 'friend' THEN UPDATE public.friendships SET status='declined',declined_at=now() WHERE id=q.notification_friendship_id;
    UPDATE public.friendships SET status='pending',declined_at=NULL WHERE id=q.notification_friendship_id;
   WHEN 'subscription' THEN UPDATE public.poll_subscriptions SET status='declined',declined_at=now() WHERE id=q.notification_subscription_id;
    UPDATE public.poll_subscriptions SET status='pending',declined_at=NULL WHERE id=q.notification_subscription_id;
   WHEN 'poll' THEN UPDATE public.poll_tasks SET status='declined',declined_at=now() WHERE id=q.notification_poll_task_id;
    UPDATE public.poll_tasks SET status='pending',declined_at=NULL WHERE id=q.notification_poll_task_id;
   WHEN 'base' THEN UPDATE public.base_share_tasks SET role='editor' WHERE id=q.notification_base_task_id;
    UPDATE public.base_share_tasks SET role='viewer' WHERE id=q.notification_base_task_id;
   WHEN 'device' THEN UPDATE public.control_device_shares SET revoked_at=now() WHERE id=q.notification_device_share_id;
    UPDATE public.control_device_shares SET revoked_at=NULL WHERE id=q.notification_device_share_id;
  END CASE;
  SELECT * INTO q FROM public.mail_queue WHERE id=q.id;
  IF public._mail_notification_queue_live_prototype(q) THEN RAISE EXCEPTION 'undo revived old allocation: %',q.notification_source_kind; END IF;
  UPDATE public.mail_queue SET status='sending' WHERE id=q.id;
  result:=public.mail_queue_delivery_context_prototype(q.id);
  IF result->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'closed source delivered: % %',q.notification_source_kind,result; END IF;
  UPDATE public.mail_queue SET status='failed' WHERE id=q.id;
 END LOOP;
 IF public.mail_queue_requeue(queue_ids,false)<>0 THEN RAISE EXCEPTION 'closed sources requeued'; END IF;
 UPDATE public.mail_queue SET status='pending',not_before=now() WHERE id=ANY(queue_ids);
 SELECT count(*) INTO affected FROM public.mail_queue_pick_selected(queue_ids,25);
 IF affected<>0 THEN RAISE EXCEPTION 'closed sources claimed'; END IF;
 -- Both account directions traverse the allocation/queue graph safely.
 BEGIN
  DELETE FROM auth.users WHERE id=owner_id;
  IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=ANY(queue_ids)) THEN RAISE EXCEPTION 'owner deletion left source mail'; END IF;
  RAISE EXCEPTION 'rollback owner deletion fixture' USING ERRCODE='ZX361';
 EXCEPTION WHEN SQLSTATE 'ZX361' THEN NULL;
 END;
 DELETE FROM auth.users WHERE id=peer;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=ANY(queue_ids) AND notification_source_kind IN('base','poll','device')) THEN RAISE EXCEPTION 'recipient account deletion left source mail'; END IF;
 DELETE FROM auth.users WHERE id=owner_id;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=ANY(queue_ids)) THEN RAISE EXCEPTION 'account graph left queue rows'; END IF;
 RAISE NOTICE 'five real RPC producers, source allocations, claim/delivery, pending/opened, delay/lease preservation, terminal undo and no closed requeue passed';
END $$;
ROLLBACK;
