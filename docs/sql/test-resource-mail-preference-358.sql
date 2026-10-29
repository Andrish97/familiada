BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('base:share','pair',86400,true),('baseline:recipient','pair',60,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
 ('aaaaaaaa-3580-0000-0000-000000000001','owner358queue@example.invalid',false,'{"username":"owner358queue"}'),
 ('bbbbbbbb-3580-0000-0000-000000000002','recipient358queue@example.invalid',false,'{"username":"recipient358queue"}');
INSERT INTO public.question_bases(id,owner_id,name) VALUES('cccccccc-3580-0000-0000-000000000003','aaaaaaaa-3580-0000-0000-000000000001','Queue358');
INSERT INTO public.email_unsub_tokens(email,suppressed_at) VALUES('recipient358queue@example.invalid',now());
DO $$ DECLARE task uuid; tok uuid; queued uuid; picked integer; BEGIN
 INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status)
 VALUES('aaaaaaaa-3580-0000-0000-000000000001','cccccccc-3580-0000-0000-000000000003','bbbbbbbb-3580-0000-0000-000000000002','recipient358queue@example.invalid','viewer','pending') RETURNING id,token INTO task,tok;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,status,not_before,cooldown_action_key,cooldown_target_key)
 VALUES('aaaaaaaa-3580-0000-0000-000000000001','recipient358queue@example.invalid','Synthetic queue audit','<a href="https://www.familiada.online/go/?b='||tok||'">Open</a>','pending',now(),'base:share','pair:aaaaaaaa-3580-0000-0000-000000000001:bbbbbbbb-3580-0000-0000-000000000002:base:cccccccc-3580-0000-0000-000000000003') RETURNING id INTO queued;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3580-0000-0000-000000000001',true);
 IF queued IS NOT NULL THEN RAISE EXCEPTION 'global mail-off entered queue'; END IF;
 SELECT count(*) INTO picked FROM public.mail_queue WHERE to_email='recipient358queue@example.invalid';
 IF picked<>0 OR EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE action_key IN('base:share','baseline:recipient') AND target_key LIKE 'pair:aaaaaaaa-3580-0000-0000-000000000001:%') THEN RAISE EXCEPTION 'mail-off consumed queue/cooldown'; END IF; RAISE NOTICE 'Resource mail preference contract: global mail-off skips queue and counters';
END $$;
-- Every resource family must obey the root flag, including addresses without accounts.
DO $$ DECLARE action text; addr text; queued uuid; BEGIN
 FOREACH action IN ARRAY ARRAY['base:share','device:share','friend:invite','poll:invite'] LOOP
  FOREACH addr IN ARRAY ARRAY['recipient358queue@example.invalid','address358queue@example.invalid'] LOOP
   INSERT INTO public.email_unsub_tokens(email,suppressed_at) VALUES(addr,now())
    ON CONFLICT(email) DO UPDATE SET suppressed_at=excluded.suppressed_at;
   INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
    VALUES('aaaaaaaa-3580-0000-0000-000000000001',addr,'Synthetic preference contract','<p>Contract</p>',action,
     'pair:aaaaaaaa-3580-0000-0000-000000000001:'||md5(addr)) RETURNING id INTO queued;
   IF queued IS NOT NULL THEN RAISE EXCEPTION 'suppressed resource mail entered queue: % %',action,addr; END IF;
  END LOOP;
 END LOOP;
 DELETE FROM public.email_unsub_tokens WHERE email='recipient358queue@example.invalid';
 UPDATE public.user_flags SET email_notifications=false WHERE user_id='bbbbbbbb-3580-0000-0000-000000000002';
 FOREACH action IN ARRAY ARRAY['base:share','device:share','friend:invite','poll:invite'] LOOP
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
   VALUES('aaaaaaaa-3580-0000-0000-000000000001','recipient358queue@example.invalid','Synthetic account preference','<p>Contract</p>',action,
    'pair:aaaaaaaa-3580-0000-0000-000000000001:bbbbbbbb-3580-0000-0000-000000000002') RETURNING id INTO queued;
  IF queued IS NOT NULL THEN RAISE EXCEPTION 'muted account mail entered queue: %',action; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE created_by='aaaaaaaa-3580-0000-0000-000000000001')
  OR EXISTS(SELECT 1 FROM public.mail_cooldowns WHERE target_key LIKE 'pair:aaaaaaaa-3580-0000-0000-000000000001:%')
 THEN RAISE EXCEPTION 'muted resource family consumed queue or clocks'; END IF;
 RAISE NOTICE 'All four resource mail families honor account and address preferences';
END $$;
ROLLBACK;
