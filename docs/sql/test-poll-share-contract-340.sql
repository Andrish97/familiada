\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3400-0000-0000-000000000001','owner340@example.net'),
 ('bbbbbbbb-3400-0000-0000-000000000002','friend340@example.net'),
 ('cccccccc-3400-0000-0000-000000000003','foreign340@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3400-0000-0000-000000000001','owner340@example.net','owner340'),
 ('bbbbbbbb-3400-0000-0000-000000000002','friend340@example.net','friend340'),
 ('cccccccc-3400-0000-0000-000000000003','foreign340@example.net','foreign340')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES
 ('aaaaaaaa-3400-0000-0000-000000000001','bbbbbbbb-3400-0000-0000-000000000002','active');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('dddddddd-3400-0000-0000-000000000004','aaaaaaaa-3400-0000-0000-000000000001','Poll340','poll_text','poll_open','run340');
INSERT INTO public.questions(game_id,ord,text) SELECT 'dddddddd-3400-0000-0000-000000000004',n,'Question '||n FROM generate_series(1,10) n;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES('poll:share','pair',86400,true) ON CONFLICT DO NOTHING;
DO $$ DECLARE
 o uuid:='aaaaaaaa-3400-0000-0000-000000000001'; u uuid:='bbbbbbbb-3400-0000-0000-000000000002';
 x uuid:='cccccccc-3400-0000-0000-000000000003'; g uuid:='dddddddd-3400-0000-0000-000000000004';
 s uuid; v_task_id uuid; token uuid; j jsonb; deadline timestamptz; clock_key text;
BEGIN
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(o,'anonymous340@example.net','active') RETURNING poll_subscriptions.id INTO s;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 clock_key:='pair:'||o||':'||u||':game:'||g;
 PERFORM public.mail_cooldown_reserve('poll:share',clock_key);
 SELECT next_allowed_at INTO deadline FROM public.mail_cooldowns WHERE action_key='poll:share' AND target_key=clock_key;
 j:=public.poll_share_send(g,ARRAY[u],ARRAY[s]);
 IF j->>'created' IS DISTINCT FROM '1' OR j->>'blocked' IS DISTINCT FROM '1' OR jsonb_array_length(j->'mail')<>1 THEN RAISE EXCEPTION 'enabled clocks %',j; END IF;
 IF j->'mail'->0->>'link' NOT LIKE '/go/?t=%' THEN RAISE EXCEPTION 'canonical go %',j; END IF;
 INSERT INTO public.user_flags(user_id,email_notifications) VALUES(u,false) ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 j:=public.poll_share_panel(g);
 IF j->'friends'->0->>'email_enabled' IS DISTINCT FROM 'false' OR j->'friends'->0->>'cooldown_until' IS NOT NULL THEN RAISE EXCEPTION 'muted picker metadata %',j; END IF;
 j:=public.poll_share_send(g,ARRAY[u],'{}');
 IF j->>'created' IS DISTINCT FROM '1' OR jsonb_array_length(j->'mail')<>0 THEN RAISE EXCEPTION 'muted access %',j; END IF;
 SELECT t.id,t.token INTO v_task_id,token FROM public.poll_tasks t WHERE t.game_id=g AND t.recipient_user_id=u;
 IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=v_task_id AND (email_send_count<>0 OR email_sent_at IS NOT NULL OR reminder_count<>0)) THEN RAISE EXCEPTION 'muted counter'; END IF;
 j:=public.poll_share_remind(g,v_task_id);
 IF j->>'mail_allowed' IS DISTINCT FROM 'false' OR jsonb_array_length(j->'mail')<>0 THEN RAISE EXCEPTION 'muted reminder %',j; END IF;
 IF (SELECT next_allowed_at FROM public.mail_cooldowns WHERE target_key=clock_key AND action_key='poll:share') IS DISTINCT FROM deadline THEN RAISE EXCEPTION 'muted reserves mail clock'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 IF public.poll_task_decline(token) IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'decline'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 j:=public.poll_share_remind(g,v_task_id);
 IF j->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'declined reminder %',j; END IF;
 UPDATE public.poll_tasks SET declined_at=now()-interval '5 days' WHERE poll_tasks.id=v_task_id;
 j:=public.poll_share_panel(g);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'tasks') z WHERE z->>'id'=v_task_id::text AND z->>'hidden'='true') THEN RAISE EXCEPTION '5d visibility %',j; END IF;
 PERFORM public.poll_share_remove(g,v_task_id);
 j:=public.poll_share_send(g,ARRAY[u],'{}');
 IF j->>'created' IS DISTINCT FROM '0' OR j->>'kept' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'removed refusal can reshare %',j; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=v_task_id AND t.status='cancelled' AND t.declined_at IS NOT NULL) THEN RAISE EXCEPTION 'lost refusal history'; END IF;
 UPDATE public.games SET status='poll_stopped' WHERE games.id=g;
 j:=public.poll_share_send(g,ARRAY[u],'{}'); IF j->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'stopped share'; END IF;
 PERFORM public.poll_resume(g);
 j:=public.poll_share_send(g,ARRAY[u],'{}'); IF j->>'created' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'resume bypass refusal'; END IF;
 UPDATE public.games SET share_key_poll='new340' WHERE games.id=g;
 j:=public.poll_share_send(g,ARRAY[u],'{}'); IF j->>'created' IS DISTINCT FROM '1' OR jsonb_array_length(j->'mail')<>0 THEN RAISE EXCEPTION 'new run %',j; END IF;
 j:=public.poll_share_remind(g,v_task_id); IF j->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'old run reminder'; END IF;

 -- Existing pending reminder keeps token and obeys count/cooldown independently.
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=u;
 SELECT t.id,t.token INTO v_task_id,token FROM public.poll_tasks t WHERE t.game_id=g AND t.share_key_poll='new340' AND t.recipient_user_id=u;
 UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE target_key=clock_key AND action_key='poll:share';
 UPDATE public.poll_tasks SET reminder_count=1 WHERE poll_tasks.id=v_task_id;
 j:=public.poll_share_remind(g,v_task_id);
 IF j->>'ok' IS DISTINCT FROM 'true' OR j->>'reminder_count' IS DISTINCT FROM '2' OR j->'mail'->0->>'token' IS DISTINCT FROM token::text THEN RAISE EXCEPTION 'reminder same token %',j; END IF;
 j:=public.poll_share_remind(g,v_task_id); IF j->>'err' IS DISTINCT FROM 'reminder limit' THEN RAISE EXCEPTION 'third reminder %',j; END IF;
 UPDATE public.user_flags SET email_notifications=false WHERE user_id=u;
 j:=public.poll_share_remind(g,v_task_id); IF j->>'mail_allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'muted at count limit %',j; END IF;
 IF (SELECT reminder_count FROM public.poll_tasks WHERE poll_tasks.id=v_task_id)<>2 THEN RAISE EXCEPTION 'mute increments reminder'; END IF;
 -- Removing a non-refusal closes only that access; new access waits for mail clock.
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=u;
 PERFORM public.poll_share_remove(g,v_task_id);
 j:=public.poll_share_send(g,ARRAY[u],'{}'); IF j->>'blocked' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'remove resets mail clock %',j; END IF;
 UPDATE public.mail_cooldowns SET next_allowed_at=now()-interval '1 second' WHERE target_key=clock_key AND action_key='poll:share';
 j:=public.poll_share_send(g,ARRAY[u],'{}'); IF j->>'created' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'new share after owner revoke %',j; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=v_task_id AND t.status<>'cancelled') THEN RAISE EXCEPTION 'old access reactivated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',x::text,true);
 IF public.poll_share_panel(g)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign panel'; END IF;
 IF public.poll_share_remove(g,v_task_id)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign remove'; END IF;
 IF public.poll_share_send(g,ARRAY[u],'{}')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign send'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.poll_share_panel(g)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'anonymous panel'; END IF;
 IF has_function_privilege('authenticated','public._poll_mail_cooldown_until(uuid,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'private clock'; END IF;
END $$;
ROLLBACK;
