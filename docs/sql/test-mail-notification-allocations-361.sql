BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('friend:invite','pair',0,false),('friend:resend','pair',0,false),('baseline:recipient','pair',0,false) ON CONFLICT(action_key) DO UPDATE SET cooldown_seconds=0,enforce=false;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3612-0000-0000-000000000001','owneralloc361@example.invalid',false,now(),'{"username":"owneralloc361"}'),
 ('bbbbbbbb-3612-0000-0000-000000000002','peeralloc361@example.invalid',false,now(),'{"username":"peeralloc361"}');
DO $$ DECLARE owner_id uuid:='aaaaaaaa-3612-0000-0000-000000000001'; peer_id uuid:='bbbbbbbb-3612-0000-0000-000000000002';
 result jsonb; friend_id uuid; token uuid; queue_id uuid; allocation_id uuid; BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 result:=public.friends_invite('peeralloc361');
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'invite fixture failed: %',result; END IF;
 friend_id:=(result->>'id')::uuid;token:=(result->>'token')::uuid;
 IF (SELECT count(*) FROM public.mail_notification_allocations_prototype WHERE friendship_id=friend_id)<>1 THEN RAISE EXCEPTION 'valid budget RPC did not issue single enqueue permission'; END IF;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token)
  VALUES(owner_id,'peeralloc361@example.invalid','Fixture','Fixture','friend:invite','fixture','friend',token) RETURNING id,notification_allocation_id INTO queue_id,allocation_id;
 IF allocation_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.mail_notification_allocations_prototype WHERE id=allocation_id AND consumed_at IS NOT NULL AND consumed_queue_id=queue_id) THEN RAISE EXCEPTION 'queue did not consume permission atomically'; END IF;
 BEGIN
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token)
   VALUES(owner_id,'peeralloc361@example.invalid','Replay','Fixture','friend:invite','fixture','friend',token);
  RAISE EXCEPTION 'same budget allocation sent twice';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_notification_attempt' THEN RAISE; END IF; END;
 UPDATE public.friendships SET email_sent_at=now()-interval '6 days' WHERE id=friend_id;
 result:=public.friends_resend(friend_id);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'resend fixture failed: %',result; END IF;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token)
  VALUES(owner_id,'peeralloc361@example.invalid','Reminder','Fixture','friend:resend','fixture','friend',token);
 UPDATE public.friendships SET email_sent_at=now()-interval '6 days' WHERE id=friend_id;
 result:=public.friends_resend(friend_id);
 IF result->>'ok'='true' THEN RAISE EXCEPTION 'resource limit bypassed by third resend'; END IF;
 IF (SELECT count(*) FROM public.mail_notification_allocations_prototype WHERE friendship_id=friend_id)<>2 THEN RAISE EXCEPTION 'rejected budget operation issued permission'; END IF;
 DELETE FROM public.mail_queue WHERE id=queue_id;
 BEGIN
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key,notification_source_kind,notification_source_token)
   VALUES(owner_id,'peeralloc361@example.invalid','Replay after deletion','Fixture','friend:invite','fixture','friend',token);
  RAISE EXCEPTION 'queue deletion reset source mail allocation';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_notification_attempt' THEN RAISE; END IF; END;
 IF has_function_privilege('authenticated','public._mail_allocate_notification_prototype(text,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public._mail_original361_friends_invite(text)','EXECUTE')
  OR has_table_privilege('authenticated','public.mail_notification_allocations_prototype','SELECT') THEN RAISE EXCEPTION 'caller can bypass allocation or inspect private proofs'; END IF;
 RAISE NOTICE 'resource RPC budget, single enqueue permission, no replay after queue deletion, no permit on limit failure and private ACL passed';
END $$;
ROLLBACK;
