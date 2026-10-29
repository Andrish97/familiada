\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('poll:share','pair',86400,true) ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3350-0000-0000-000000000001','owner335@example.net'),
 ('bbbbbbbb-3350-0000-0000-000000000002','registered335@example.net');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3350-0000-0000-000000000001','owner335@example.net','owner335'),
 ('bbbbbbbb-3350-0000-0000-000000000002','registered335@example.net','registered335')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
 ('cccccccc-3350-0000-0000-000000000003','aaaaaaaa-3350-0000-0000-000000000001','Sharing335','poll_text','poll_open','sharing335');
DO $$ DECLARE owner_id uuid:='aaaaaaaa-3350-0000-0000-000000000001';
 account_id uuid:='bbbbbbbb-3350-0000-0000-000000000002';
 gid uuid:='cccccccc-3350-0000-0000-000000000003';
 registered_sub uuid; legacy_sub uuid; anonymous_sub uuid; r jsonb;
BEGIN
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(owner_id,'registered335@example.net','active') RETURNING id INTO registered_sub;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_user_id,status) VALUES(owner_id,account_id,'active') RETURNING id INTO legacy_sub;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(owner_id,'anonymous335@example.net','active') RETURNING id INTO anonymous_sub;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 r:=public.poll_share_send(gid,'{}',ARRAY[registered_sub,legacy_sub]);
 IF r->>'created'<>'0' OR EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id=gid) THEN RAISE EXCEPTION 'registered subscription shared %',r; END IF;
 r:=public.polls_hub_share_poll(gid,ARRAY[registered_sub,legacy_sub]);
 IF r->>'created'<>'0' OR EXISTS(SELECT 1 FROM public.poll_tasks WHERE game_id=gid) THEN RAISE EXCEPTION 'legacy account sharing %',r; END IF;
 r:=public.poll_share_send(gid,'{}',ARRAY[anonymous_sub]);
 IF r->>'created'<>'1' THEN RAISE EXCEPTION 'anonymous sharing broken %',r; END IF;
 INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES(owner_id,account_id,'active');
 -- Accepted Friendship is the account channel; its trigger removes old subscriptions.
 r:=public.poll_share_send(gid,ARRAY[account_id],ARRAY[registered_sub]);
 IF r->>'created'<>'1'
 OR (SELECT count(*) FROM public.poll_tasks WHERE game_id=gid AND recipient_user_id=account_id)<>1 THEN RAISE EXCEPTION 'friend channel/dedup %',r; END IF;
END $$;
ROLLBACK;
