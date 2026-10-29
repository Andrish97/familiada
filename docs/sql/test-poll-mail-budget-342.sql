\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3420-0000-0000-000000000001','owner342@example.net'),('bbbbbbbb-3420-0000-0000-000000000002','recipient342@example.net');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3420-0000-0000-000000000001','owner342@example.net','owner342'),('bbbbbbbb-3420-0000-0000-000000000002','recipient342@example.net','recipient342') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:share','pair',86400,true) ON CONFLICT DO NOTHING;
-- Budżet testujemy niezależnie od podłogi dla maili: transakcyjna fixture.
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('baseline:recipient','pair',0,false) ON CONFLICT(action_key) DO UPDATE SET cooldown_seconds=0,enforce=false;
DO $$ DECLARE o uuid:='aaaaaaaa-3420-0000-0000-000000000001'; u uuid:='bbbbbbbb-3420-0000-0000-000000000002';
 ids uuid[]:='{}'; qid uuid; n integer; before_count integer; deadline timestamptz;
BEGIN
 FOR n IN 1..3 LOOP
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
  VALUES(o,CASE WHEN n=2 THEN ' RECIPIENT342@EXAMPLE.NET ' ELSE 'recipient342@example.net' END,'Budget342','<p>342</p>','poll:share','fixture:'||n) RETURNING id INTO qid;
  ids:=array_append(ids,qid);
 END LOOP;
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE owner_id=o)<>3 THEN RAISE EXCEPTION 'missing durable reservations'; END IF;
 deadline:=public._poll_daily_cap_until(o,'recipient342@example.net');
 IF deadline IS NULL THEN RAISE EXCEPTION '3/24 cap absent'; END IF;
 FOREACH qid IN ARRAY ids LOOP PERFORM public.mail_queue_mark(qid,true,'fixture',''); END LOOP;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=ANY(ids)) THEN RAISE EXCEPTION 'delivery did not remove queue'; END IF;
 IF public._poll_daily_cap_until(o,'recipient342@example.net') IS DISTINCT FROM deadline THEN RAISE EXCEPTION 'delivery resets cap'; END IF;
 BEGIN
  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
  VALUES(o,'recipient342@example.net','Fourth342','<p>342</p>','poll:share','fixture:fourth');
  RAISE EXCEPTION 'fourth mail admitted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'cooldown_active: poll daily_cap%' THEN RAISE; END IF;
 END;
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(u,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
 VALUES(o,'recipient342@example.net','Muted342','<p>342</p>','poll:share','fixture:muted');
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE owner_id=o)<>3 THEN RAISE EXCEPTION 'muted mail consumes budget'; END IF;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE created_by=o) THEN RAISE EXCEPTION 'muted mail queued'; END IF;
 INSERT INTO public.email_unsub_tokens(email,suppressed_at) VALUES('anonymous342@example.net',now());
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
 VALUES(o,'anonymous342@example.net','GloballyMuted342','<p>342</p>','poll:share','fixture:muted-anonymous');
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE created_by=o) OR EXISTS(SELECT 1 FROM public.poll_mail_budget_events WHERE owner_id=o AND recipient_key=md5('anonymous342@example.net')) THEN RAISE EXCEPTION 'globally muted queued/counted'; END IF;
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=u;
 -- Granica dokładnie24h nie blokuje; starsze zdarzenia sprząta cron.
 UPDATE public.poll_mail_budget_events SET created_at=now()-interval '24 hours' WHERE owner_id=o;
 IF public._poll_daily_cap_until(o,'recipient342@example.net') IS NOT NULL THEN RAISE EXCEPTION '24h boundary'; END IF;
 PERFORM public.poll_mail_budget_expire_due();
 IF EXISTS(SELECT 1 FROM public.poll_mail_budget_events WHERE owner_id=o) THEN RAISE EXCEPTION 'event cleanup'; END IF;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
 VALUES(o,'recipient342@example.net','New342','<p>342</p>','poll:share','fixture:new');
 IF (SELECT count(*) FROM public.poll_mail_budget_events WHERE owner_id=o)<>1 THEN RAISE EXCEPTION 'new mail after24h'; END IF;
 IF has_table_privilege('authenticated','public.poll_mail_budget_events','SELECT')
 OR has_function_privilege('authenticated','public.poll_mail_budget_expire_due()','EXECUTE') THEN RAISE EXCEPTION 'budget privacy/cleanup ACL'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 IF public.e2e_poll_mail_budget_cleanup('test8@familiada.online')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'normal account can reset budget'; END IF;

 UPDATE auth.users SET email='test7@familiada.online' WHERE id=o;
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key) VALUES(gen_random_uuid(),o,md5('test8@familiada.online')),(gen_random_uuid(),u,md5('test8@familiada.online'));
 IF public.e2e_poll_mail_budget_cleanup(' TEST8@FAMILIADA.ONLINE ')->>'deleted' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'test pair cleanup'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_mail_budget_events WHERE owner_id=u AND recipient_key=md5('test8@familiada.online')) THEN RAISE EXCEPTION 'cleanup affects other sender'; END IF;
 IF public.e2e_poll_mail_budget_cleanup('recipient342@example.net')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'test helper resets normal recipient'; END IF;
 DELETE FROM auth.users WHERE id=o;
 IF EXISTS(SELECT 1 FROM public.poll_mail_budget_events WHERE owner_id=o) THEN RAISE EXCEPTION 'owner deletion leaves budget'; END IF;
END $$;
ROLLBACK;
