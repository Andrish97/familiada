BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('device:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
 ('aaaaaaaa-3582-0000-0000-000000000001','owner358contract@example.invalid',false,'{"username":"owner358contract"}'),
 ('bbbbbbbb-3582-0000-0000-000000000002','recipient358contract@example.invalid',false,'{"username":"recipient358contract"}'),
 ('aaaaaaaa-3582-0000-0000-000000000003','guest358contract@example.invalid',true,'{"username":"guest358contract","is_guest":false}');
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('cccccccc-3582-0000-0000-000000000004','aaaaaaaa-3582-0000-0000-000000000001','Contract358','prepared','draft'),
 ('cccccccc-3582-0000-0000-000000000005','aaaaaaaa-3582-0000-0000-000000000003','Guest358','prepared','draft');
INSERT INTO public.control_runtime_sessions(game_id,owner_id) VALUES
 ('cccccccc-3582-0000-0000-000000000004','aaaaaaaa-3582-0000-0000-000000000001'),
 ('cccccccc-3582-0000-0000-000000000005','aaaaaaaa-3582-0000-0000-000000000003');
DO $$ DECLARE scenario text; r jsonb; pre jsonb; pid uuid; addr text;
 owner_id uuid:='aaaaaaaa-3582-0000-0000-000000000001'; peer uuid:='bbbbbbbb-3582-0000-0000-000000000002'; guest uuid:='aaaaaaaa-3582-0000-0000-000000000003';
 game uuid:='cccccccc-3582-0000-0000-000000000004'; off boolean;
BEGIN
 FOREACH scenario IN ARRAY ARRAY['account-on','account-off','address-on','address-off','registered-email','guest-address','profile-spoof'] LOOP
  pid:=NULL; addr:=NULL; off:=scenario IN('account-off','address-off');
  IF scenario LIKE 'account-%' THEN pid:=peer;
  ELSIF scenario IN('registered-email','profile-spoof') THEN addr:='RECIPIENT358CONTRACT@EXAMPLE.INVALID';
  ELSIF scenario='guest-address' THEN addr:='guest358contract@example.invalid';
  ELSE addr:='address358contract@example.invalid'; END IF;
  UPDATE public.user_flags SET email_notifications=NOT off WHERE user_id=peer;
  DELETE FROM public.email_unsub_tokens WHERE email='address358contract@example.invalid';
  IF off THEN INSERT INTO public.email_unsub_tokens(email,suppressed_at) VALUES('address358contract@example.invalid',now()); END IF;
  IF scenario='profile-spoof' THEN UPDATE public.profiles SET email='spoof358contract@example.invalid' WHERE id=peer; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  pre:=public.control_device_share_preflight(game,'host',pid,addr);
  IF scenario='address-off' AND to_regprocedure('public.mail_center_list(text)') IS NOT NULL THEN
   --360: global refusal of an anonymous address also rejects new grants.
   IF pre->>'error' IS DISTINCT FROM 'notifications_disabled'
    OR public.control_device_share_create(game,'host',pid,addr)->>'error' IS DISTINCT FROM 'notifications_disabled'
    OR EXISTS(SELECT 1 FROM public.control_device_shares WHERE game_id=game)
    OR EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='device:share' AND target_key LIKE 'pair:'||owner_id||':%:game:'||game)
   THEN RAISE EXCEPTION 'anonymous global refusal allowed access or spent budget: %',pre; END IF;
   RAISE NOTICE 'Control358/360 contract: address-off rejects new grants';
   CONTINUE;
  END IF;
  IF pre->>'ok' IS DISTINCT FROM 'true' OR (pre->>'mail_disabled')::boolean IS DISTINCT FROM off
   THEN RAISE EXCEPTION 'preflight % %',scenario,pre; END IF;
  r:=public.control_device_share_create(game,'host',pid,addr);
  IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'created' IS DISTINCT FROM 'true'
   OR (r->>'mail_allowed')::boolean IS DISTINCT FROM NOT off
   OR (r->>'mail_disabled')::boolean IS DISTINCT FROM off THEN RAISE EXCEPTION 'create % %',scenario,r; END IF;
  IF off AND EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='device:share' AND target_key LIKE 'pair:'||owner_id||':%:game:'||game)
   THEN RAISE EXCEPTION 'mail-off consumed budget'; END IF;
  IF scenario IN('registered-email','profile-spoof') AND
   (r->>'recipient_id' IS DISTINCT FROM peer::text OR r->>'mail_to' IS DISTINCT FROM 'recipient358contract@example.invalid')
   THEN RAISE EXCEPTION 'canonical Auth identity %',r; END IF;
  IF scenario='guest-address' AND (r->>'recipient_id' IS NOT NULL OR r->>'recipient_email' IS DISTINCT FROM addr)
   THEN RAISE EXCEPTION 'unconfirmed guest became an account recipient'; END IF;
  DELETE FROM public.control_device_shares WHERE game_id=game;
  DELETE FROM public.mail_cooldowns WHERE action_key='device:share' AND target_key LIKE 'pair:'||owner_id||':%:game:'||game;
  RAISE NOTICE 'Control358 contract: % passed',scenario;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',guest::text,true);
 r:=public.control_device_share_create('cccccccc-3582-0000-0000-000000000005','host',peer,NULL);
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'anonymous issuer bypass'; END IF;
 PERFORM set_config('request.jwt.claim.sub',peer::text,true);
 IF public.control_device_share_create(game,'host',owner_id,NULL)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign owner'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 IF public.control_device_share_create(game,'host',owner_id,NULL)->>'error' IS DISTINCT FROM 'self_share' THEN RAISE EXCEPTION 'self share'; END IF;
 IF public.control_device_share_preflight(game,'host',owner_id,NULL)->>'error' IS DISTINCT FROM 'self_share' THEN RAISE EXCEPTION 'self preflight'; END IF;
 UPDATE public.control_runtime_sessions SET expires_at=now()-interval '1 second' WHERE game_id=game;
 IF public.control_device_share_create(game,'host',peer,NULL)->>'error' IS DISTINCT FROM 'session_expired' THEN RAISE EXCEPTION 'expired parent'; END IF;
 RAISE NOTICE 'Control358 guest/foreign/self/expired passed';
END $$;

DO $$ DECLARE r jsonb; game uuid:='cccccccc-3582-0000-0000-000000000004'; peer uuid:='bbbbbbbb-3582-0000-0000-000000000002'; owner_id uuid:='aaaaaaaa-3582-0000-0000-000000000001'; BEGIN
 UPDATE public.control_runtime_sessions SET expires_at=now()+interval '1 hour' WHERE game_id=game;
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=peer;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 r:=public.control_device_share_create_by_lookup(game,'display','spoof358contract@example.invalid');
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'recipient_id' IS NOT NULL OR r->>'recipient_email' IS DISTINCT FROM 'spoof358contract@example.invalid' THEN RAISE EXCEPTION 'profile alias misdirected address grant %',r; END IF;
 r:=public.control_device_share_create_by_lookup(game,'buzzer','recipient358contract');
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'recipient_id' IS DISTINCT FROM peer::text OR r->>'mail_to' IS DISTINCT FROM 'recipient358contract@example.invalid' THEN RAISE EXCEPTION 'username canonical lookup %',r; END IF;
 IF public.control_device_share_to_friend(game,'host',peer)->>'error' IS DISTINCT FROM 'not_friend' THEN RAISE EXCEPTION 'stale friend selection became direct'; END IF;
 INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES(owner_id,peer,'active');
 r:=public.control_device_share_to_friend(game,'host',peer);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'active friend denied %',r; END IF;
 IF has_function_privilege('authenticated','public._control_share_recipient_lookup(uuid,text)','EXECUTE')
 OR has_function_privilege('anon','public.control_device_share_to_friend(uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'lookup/friend ACL'; END IF;
 RAISE NOTICE 'Control358 canonical username, address spoof, stale/active friend and ACL passed';
END $$;
ROLLBACK;
