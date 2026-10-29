BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:invite_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3594-0000-0000-000000000001','owner359resign@example.invalid',false,now(),'{"username":"owner359resign"}'),
 ('bbbbbbbb-3594-0000-0000-000000000002','account359resign@example.invalid',false,now(),'{"username":"account359resign"}');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001','Global359','poll_text','poll_open','resign359');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id) VALUES
 ('dddddddd-3594-0000-0000-000000000004','cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001');
INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,email_send_count,email_sent_at) VALUES
 ('aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','active',1,now()-interval '1 day');
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,status) VALUES
 ('aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','cccccccc-3594-0000-0000-000000000003','poll_text','resign359','pending'),
 ('aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','cccccccc-3594-0000-0000-000000000003','poll_text','resign359','done'),
 ('aaaaaaaa-3594-0000-0000-000000000001','other359resign@example.invalid','cccccccc-3594-0000-0000-000000000003','poll_text','resign359','pending');
INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_email,device_type) VALUES
 ('dddddddd-3594-0000-0000-000000000004','cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001','address359resign@example.invalid','host'),
 ('dddddddd-3594-0000-0000-000000000004','cccccccc-3594-0000-0000-000000000003','aaaaaaaa-3594-0000-0000-000000000001','other359resign@example.invalid','host');
DO $$ DECLARE issued jsonb; secret text; sub_id uuid; task_id uuid; other_task uuid; device_token uuid; result jsonb; owner uuid:='aaaaaaaa-3594-0000-0000-000000000001'; game uuid:='cccccccc-3594-0000-0000-000000000003'; BEGIN
 issued:=public.mail_center_issue_link_prototype('address359resign@example.invalid','footer'); secret:=public.mail_center_exchange_link_prototype(issued->>'token')->>'session_secret';
 SELECT id INTO sub_id FROM public.poll_subscriptions WHERE subscriber_email='address359resign@example.invalid';
 SELECT id INTO task_id FROM public.poll_tasks WHERE recipient_email='address359resign@example.invalid' AND status='pending';
 SELECT id INTO other_task FROM public.poll_tasks WHERE recipient_email='other359resign@example.invalid';
 SELECT token INTO device_token FROM public.control_device_shares WHERE recipient_email='address359resign@example.invalid';
 IF public.mail_center_action_prototype(secret,'poll',other_task,'decline')->>'ok'='true' THEN RAISE EXCEPTION 'foreign source accepted'; END IF;
 result:=public.mail_center_action_prototype(secret,'poll',task_id,'decline');
 IF result->>'ok' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM public.poll_tasks WHERE id=task_id AND status='declined') THEN RAISE EXCEPTION 'own poll decline failed'; END IF;
 UPDATE public.poll_subscriptions SET status='pending',accepted_at=NULL WHERE id=sub_id;
 IF public.mail_center_action_prototype(secret,'subscription',sub_id,'accept')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'subscription accept failed'; END IF;
 IF public.mail_center_action_prototype(secret,'subscription',sub_id,'decline')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'subscription withdrawal failed'; END IF;
 PERFORM public.mail_center_set_notifications_prototype(secret,false);
 IF public.control_device_key_valid(game,'host',device_token::text) OR public.control_device_share_resolve(device_token)->>'ok'='true' THEN RAISE EXCEPTION 'muted anonymous device key remained valid'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner::text,true);
 IF public.subscribers_invite('address359resign@example.invalid')->>'err' IS DISTINCT FROM 'notifications_disabled' THEN RAISE EXCEPTION 'muted subscription recreated'; END IF;
 IF public.control_device_share_create(game,'host',NULL,'address359resign@example.invalid')->>'error' IS DISTINCT FROM 'notifications_disabled' THEN RAISE EXCEPTION 'muted device recreated'; END IF;
 IF public.control_device_share_preflight(game,'host',NULL,'address359resign@example.invalid')->>'error' IS DISTINCT FROM 'notifications_disabled' THEN RAISE EXCEPTION 'muted device preflight allowed'; END IF;
 BEGIN
  INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,status) VALUES(owner,'address359resign@example.invalid',game,'poll_text','resign359','pending');
  RAISE EXCEPTION 'muted task inserted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN('notifications_disabled','Invalid contact source') THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_email,device_type) VALUES('dddddddd-3594-0000-0000-000000000004',game,owner,'address359resign@example.invalid','display');
  RAISE EXCEPTION 'muted raw device inserted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'notifications_disabled' THEN RAISE; END IF; END;
 -- The account toggle still only disables mail; cancellation scope is pending.
 UPDATE public.user_flags SET email_notifications=false WHERE user_id='bbbbbbbb-3594-0000-0000-000000000002';
 result:=public.control_device_share_create(game,'display','bbbbbbbb-3594-0000-0000-000000000002',NULL);
 IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'mail_allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'account mail-off access changed: %',result; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF has_function_privilege('authenticated','public.mail_center_action_prototype(text,text,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.mail_center_list_prototype(text)','EXECUTE') THEN RAISE EXCEPTION 'sender/anon gained portal RPC'; END IF;
 RAISE NOTICE 'Portal actions and muted anonymous creation/key boundaries passed';
END $$;
ROLLBACK;
