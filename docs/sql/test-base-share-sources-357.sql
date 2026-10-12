BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES ('base:share','pair',86400,true) ON CONFLICT DO NOTHING;
DO $$ DECLARE scenario text; r record; manual_task uuid; friend_task uuid; token uuid;
 owner_id uuid:='aaaaaaaa-3571-0000-0000-000000000001'; recipient uuid:='bbbbbbbb-3571-0000-0000-000000000002';
 fid uuid:='dddddddd-3571-0000-0000-000000000004'; manual_base uuid:='cccccccc-3571-0000-0000-000000000003'; friend_base uuid:='cccccccc-3571-0000-0000-000000000005';
BEGIN
 FOREACH scenario IN ARRAY ARRAY['remove','hard-delete','accepted','declined','mail-off'] LOOP
  INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
   (owner_id,'owner357contract@example.invalid',false,'{"username":"owner357contract"}'),
   (recipient,'recipient357contract@example.invalid',false,'{"username":"recipient357contract"}');
  INSERT INTO public.friendships(id,requester_id,addressee_id,status) VALUES(fid,owner_id,recipient,'active');
  INSERT INTO public.question_bases(id,owner_id,name) VALUES(manual_base,owner_id,'Manual357'),(friend_base,owner_id,'Friend357');
  IF scenario='mail-off' THEN UPDATE public.user_flags SET email_notifications=false WHERE user_id=recipient; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  SELECT * INTO r FROM public.base_share_by_user(manual_base,'recipient357contract'::text,'viewer');
  IF NOT r.ok THEN RAISE EXCEPTION 'manual share failed %',to_jsonb(r); END IF;
  SELECT id INTO manual_task FROM public.base_share_tasks WHERE base_id=manual_base;
  SELECT * INTO r FROM public.base_share_to_friend(friend_base,recipient,'editor');
  IF NOT r.ok THEN RAISE EXCEPTION 'friend share failed %',to_jsonb(r); END IF;
  SELECT id,base_share_tasks.token INTO friend_task,token FROM public.base_share_tasks WHERE base_id=friend_base;
  IF NOT EXISTS(SELECT 1 FROM public.base_share_tasks WHERE id=manual_task AND source_kind='base' AND source_friendship_id IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.base_share_tasks WHERE id=friend_task AND source_kind='friend' AND source_friendship_id=fid)
   THEN RAISE EXCEPTION 'wrong source'; END IF;
  IF scenario='mail-off' AND (r.mail_to IS NOT NULL OR EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key='base:share' AND target_key='pair:'||owner_id||':'||recipient||':base:'||friend_base))
   THEN RAISE EXCEPTION 'mail-off consumed budget'; END IF;
  PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
  IF scenario='accepted' AND NOT public.base_share_accept(friend_task) THEN RAISE EXCEPTION 'accept failed'; END IF;
  IF scenario='declined' AND NOT public.base_share_decline(friend_task) THEN RAISE EXCEPTION 'decline failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  IF scenario='hard-delete' THEN DELETE FROM public.friendships WHERE id=fid;
  ELSE IF public.friends_remove(fid)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'friend removal failed'; END IF; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.base_share_tasks WHERE id=manual_task AND status='pending' AND cancelled_at IS NULL)
   THEN RAISE EXCEPTION 'independent manual share cancelled'; END IF;
  SELECT * INTO r FROM public.base_share_to_friend(friend_base,recipient,'viewer');
  IF r.err IS DISTINCT FROM 'not_friend' THEN RAISE EXCEPTION 'stale friend selection fell back to direct grant %',to_jsonb(r); END IF;
  PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
  IF scenario='accepted' THEN
   IF NOT EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id=friend_base AND user_id=recipient AND role='editor')
    OR NOT EXISTS(SELECT 1 FROM public.base_share_token_info(token::text)) THEN RAISE EXCEPTION 'independent accepted role lost'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.base_share_tasks WHERE id=friend_task AND cancelled_at IS NOT NULL) THEN RAISE EXCEPTION 'source share not cancelled'; END IF;
   IF public.base_share_accept(friend_task) OR public.base_share_undo_decline(friend_task)->>'ok'='true'
    OR EXISTS(SELECT 1 FROM public.base_share_token_info(token::text)) THEN RAISE EXCEPTION 'closed source still grants access'; END IF;
   IF scenario='declined' AND public._base_share_refusal_until(friend_base,recipient)<now()+interval '29 days' THEN RAISE EXCEPTION 'refusal clock reset'; END IF;
  END IF;
  IF NOT public.base_share_accept(manual_task) THEN RAISE EXCEPTION 'manual invitation no longer acceptable'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  DELETE FROM auth.users WHERE id IN(owner_id,recipient);
  DELETE FROM public.mail_cooldowns WHERE target_key IN('pair:'||owner_id||':'||recipient,'pair:'||recipient||':'||owner_id)
   OR target_key LIKE 'pair:'||owner_id||':'||recipient||':%'
   OR target_key LIKE 'pair:'||recipient||':'||owner_id||':%';
  RAISE NOTICE '357 source contract: % passed',scenario;
 END LOOP;
END $$;
-- Identity and ACL checks use real Auth initialization and authenticated role.
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
 ('aaaaaaaa-3579-0000-0000-000000000001','owner357identity@example.invalid',false,'{"username":"owner357identity"}'),
 ('bbbbbbbb-3579-0000-0000-000000000002','recipient357identity@example.invalid',false,'{"username":"recipient357identity"}'),
 ('aaaaaaaa-3579-0000-0000-000000000003',NULL,true,'{"username":"guest357sender","is_guest":false}');
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('cccccccc-3579-0000-0000-000000000003','aaaaaaaa-3579-0000-0000-000000000001','Identity357'),
 ('cccccccc-3579-0000-0000-000000000004','aaaaaaaa-3579-0000-0000-000000000003','Guest357');
-- A stale/mismatched profile email cannot redirect delivery or resolve an account.
UPDATE public.profiles SET email='spoof357identity@example.invalid' WHERE id='bbbbbbbb-3579-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3579-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.base_share_by_user('cccccccc-3579-0000-0000-000000000003','spoof357identity@example.invalid'::text,'viewer');
 IF r.ok OR r.err IS DISTINCT FROM 'unknown_user' THEN RAISE EXCEPTION 'profile email accepted as Auth identity'; END IF;
 SELECT * INTO r FROM public.base_share_by_user('cccccccc-3579-0000-0000-000000000003','recipient357identity'::text,'viewer');
 IF NOT r.ok OR r.mail_to IS DISTINCT FROM 'recipient357identity@example.invalid' THEN RAISE EXCEPTION 'canonical recipient mail incorrect %',to_jsonb(r); END IF;
 IF has_function_privilege('authenticated','public._base_share_create(uuid,uuid,public.base_share_role,boolean,text)','EXECUTE')
  OR has_function_privilege('anon','public.base_share_to_friend(uuid,uuid,public.base_share_role)','EXECUTE')
 THEN RAISE EXCEPTION 'private helper or friend API exposed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3579-0000-0000-000000000003',true);
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.base_share_by_user('cccccccc-3579-0000-0000-000000000004','recipient357identity'::text,'viewer');
 IF r.ok THEN RAISE EXCEPTION 'anonymous owner granted share'; END IF;
 SELECT * INTO r FROM public.base_share_by_user('cccccccc-3579-0000-0000-000000000004','bbbbbbbb-3579-0000-0000-000000000002'::uuid,'viewer');
 IF r.ok THEN RAISE EXCEPTION 'anonymous owner bypassed direct UUID API'; END IF;
 RAISE NOTICE '357 canonical Auth mail, profile spoof, private ACL and anonymous owner passed';
END $$;
RESET ROLE;
ROLLBACK;
