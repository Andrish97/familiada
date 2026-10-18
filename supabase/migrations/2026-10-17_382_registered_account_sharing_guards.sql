-- Gość ma auth.uid(), ale dla funkcji społecznościowych nie jest kontem
-- zarejestrowanym. Utrzymujemy ogólny predykat konta; starsza nazwa
-- _poll_identity_regular pozostaje aliasem dla już istniejących RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public._account_is_registered(p_uid uuid,p_identity jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_uid IS NOT NULL AND p_identity IS NOT NULL
   AND NOT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id=p_uid),
     coalesce(p_identity->>'is_anonymous','false')='true'
       OR coalesce(p_identity->'raw_user_meta_data'->>'is_guest','false')='true')
   AND NOT (coalesce(p_identity->>'is_anonymous','false')='true'
     AND ((p_identity->>'email_confirmed_at') IS NULL
       OR public._norm_email(p_identity->>'email') IS NULL));
$$;

CREATE OR REPLACE FUNCTION public._poll_identity_regular(p_uid uuid,p_identity jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public._account_is_registered(p_uid,p_identity);
$$;

CREATE OR REPLACE FUNCTION public._registered_sharing_rows_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE owner_id uuid; recipient_id uuid; other_id uuid; identity jsonb;
BEGIN
  -- Zaufane operacje serwerowe i migracje mogą porządkować starsze dane.
  IF auth.uid() IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='friendships' THEN owner_id:=OLD.requester_id; other_id:=OLD.addressee_id;
    ELSIF TG_TABLE_NAME='poll_subscriptions' THEN owner_id:=OLD.owner_id; recipient_id:=coalesce(OLD.registered_user_id,OLD.subscriber_user_id);
    ELSIF TG_TABLE_NAME='poll_tasks' THEN owner_id:=OLD.owner_id; recipient_id:=OLD.recipient_user_id;
    ELSIF TG_TABLE_NAME='base_share_tasks' THEN owner_id:=OLD.owner_id; recipient_id:=OLD.recipient_user_id;
    ELSIF TG_TABLE_NAME='control_device_shares' THEN owner_id:=OLD.owner_id; recipient_id:=OLD.recipient_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME='friendships' THEN owner_id:=NEW.requester_id; other_id:=NEW.addressee_id;
    ELSIF TG_TABLE_NAME='poll_subscriptions' THEN owner_id:=NEW.owner_id; recipient_id:=coalesce(NEW.registered_user_id,NEW.subscriber_user_id);
    ELSIF TG_TABLE_NAME='poll_tasks' THEN owner_id:=NEW.owner_id; recipient_id:=NEW.recipient_user_id;
    ELSIF TG_TABLE_NAME='base_share_tasks' THEN owner_id:=NEW.owner_id; recipient_id:=NEW.recipient_user_id;
    ELSIF TG_TABLE_NAME='control_device_shares' THEN owner_id:=NEW.owner_id; recipient_id:=NEW.recipient_id;
    ELSIF TG_TABLE_NAME='market_games' THEN
      owner_id:=NEW.author_user_id;
      IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'registered_account_required'; END IF;
    END IF;
  END IF;

  IF owner_id IS NOT NULL THEN
    SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=owner_id;
    IF NOT public._account_is_registered(owner_id,identity) THEN
      RAISE EXCEPTION 'registered_account_required' USING ERRCODE='42501';
    END IF;
  END IF;
  FOREACH recipient_id IN ARRAY ARRAY[recipient_id,other_id] LOOP
    IF recipient_id IS NOT NULL THEN
      SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=recipient_id;
      IF NOT public._account_is_registered(recipient_id,identity) THEN
        RAISE EXCEPTION 'registered_account_required' USING ERRCODE='42501';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public._account_is_registered(uuid,jsonb),public._registered_sharing_rows_guard() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS registered_friendship_parties ON public.friendships;
CREATE TRIGGER registered_friendship_parties BEFORE INSERT OR UPDATE OR DELETE ON public.friendships
 FOR EACH ROW EXECUTE FUNCTION public._registered_sharing_rows_guard();
DROP TRIGGER IF EXISTS registered_subscription_parties ON public.poll_subscriptions;
CREATE TRIGGER registered_subscription_parties BEFORE INSERT OR UPDATE OR DELETE ON public.poll_subscriptions
 FOR EACH ROW EXECUTE FUNCTION public._registered_sharing_rows_guard();
DROP TRIGGER IF EXISTS registered_poll_task_parties ON public.poll_tasks;
CREATE TRIGGER registered_poll_task_parties BEFORE INSERT OR UPDATE OR DELETE ON public.poll_tasks
 FOR EACH ROW EXECUTE FUNCTION public._registered_sharing_rows_guard();
DROP TRIGGER IF EXISTS registered_base_share_parties ON public.base_share_tasks;
CREATE TRIGGER registered_base_share_parties BEFORE INSERT OR UPDATE OR DELETE ON public.base_share_tasks
 FOR EACH ROW EXECUTE FUNCTION public._registered_sharing_rows_guard();
DROP TRIGGER IF EXISTS registered_device_share_parties ON public.control_device_shares;
CREATE TRIGGER registered_device_share_parties BEFORE INSERT OR UPDATE OR DELETE ON public.control_device_shares
 FOR EACH ROW EXECUTE FUNCTION public._registered_sharing_rows_guard();
DROP TRIGGER IF EXISTS registered_market_submission_author ON public.market_games;
CREATE TRIGGER registered_market_submission_author BEFORE INSERT ON public.market_games
 FOR EACH ROW EXECUTE FUNCTION public._registered_sharing_rows_guard();

CREATE OR REPLACE FUNCTION public.friends_list()
RETURNS TABLE(id uuid,user_id uuid,label text,email text,status text,direction text,created_at timestamptz,accepted_at timestamptz,email_sent_at timestamptz,email_send_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN; END IF;
 RETURN QUERY
 SELECT f.id,p.id,coalesce(nullif(p.username,''),public._norm_email(u.email)),public._norm_email(u.email),f.status,
   CASE WHEN f.status='active' THEN 'friend' WHEN f.decision_user_id=uid THEN 'incoming' ELSE 'outgoing' END,
   f.created_at,f.accepted_at,f.email_sent_at,f.email_send_count
 FROM public.friendships f JOIN public.profiles p ON p.id=CASE WHEN f.requester_id=uid THEN f.addressee_id ELSE f.requester_id END
 JOIN auth.users u ON u.id=p.id
 WHERE f.cancelled_at IS NULL AND (f.requester_id=uid OR f.addressee_id=uid)
   AND (f.status<>'declined' OR (f.declined_at>now()-interval '30 days'
     AND (f.decision_user_id=uid OR f.declined_at>now()-interval '5 days')))
 ORDER BY f.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.subscribers_list()
RETURNS TABLE(id uuid,email text,status text,created_at timestamptz,token uuid,email_sent_at timestamptz,email_send_count integer,friend_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN; END IF;
 RETURN QUERY SELECT s.id,coalesce((SELECT u.email FROM auth.users u WHERE u.id=s.registered_user_id),s.subscriber_email),
   s.status,s.created_at,s.token,s.email_sent_at,s.email_send_count,
   coalesce(s.registered_user_id,public._poll_registered_uid(s.subscriber_email))
 FROM public.poll_subscriptions s WHERE s.owner_id=uid AND s.subscriber_user_id IS NULL
   AND (s.status IN('pending','active') OR (s.status='declined' AND s.declined_at>now()-interval '5 days'))
 ORDER BY s.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.tasks_list(p_kind text DEFAULT NULL)
RETURNS TABLE(kind text,id uuid,state text,title text,owner_label text,created_at timestamptz,done_at timestamptz,token uuid,poll_type text,role text,device_type text,game_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
#variable_conflict use_column
DECLARE uid uuid:=auth.uid(); identity jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN; END IF;
 PERFORM public.poll_claim_email_records();
 IF p_kind IS NULL OR p_kind='poll' THEN
  RETURN QUERY SELECT 'poll'::text,t.id,CASE WHEN t.done_at IS NOT NULL THEN 'done' ELSE 'todo' END,
   coalesce(g.name,'Sondaż '||left(t.game_id::text,8)),coalesce(nullif(p.username,''),p.email),t.created_at,t.done_at,t.token,
   t.poll_type,NULL::text,NULL::text,t.game_id,NULL::timestamptz
  FROM public.poll_tasks t LEFT JOIN public.games g ON g.id=t.game_id LEFT JOIN public.profiles p ON p.id=t.owner_id
  WHERE t.recipient_user_id=uid AND t.declined_at IS NULL AND t.cancelled_at IS NULL
    AND (t.done_at IS NULL OR t.done_at>now()-interval '5 days') ORDER BY t.created_at DESC;
 END IF;
 IF p_kind IS NULL OR p_kind='base' THEN
  RETURN QUERY SELECT 'base'::text,bt.id,
   CASE WHEN bt.status IN('pending','opened') THEN 'todo' ELSE 'done' END,
   coalesce(b.name,'Baza pytań'),coalesce(nullif(p.username,''),p.email),bt.created_at,
   CASE WHEN bt.status='done' THEN bt.accepted_at END,bt.token,NULL::text,bt.role::text,NULL::text,NULL::uuid,NULL::timestamptz
  FROM public.base_share_tasks bt LEFT JOIN public.question_bases b ON b.id=bt.base_id
   LEFT JOIN public.profiles p ON p.id=bt.owner_id
  WHERE bt.recipient_user_id=uid AND (bt.status IN('pending','opened') OR (bt.status='done' AND bt.accepted_at>now()-interval '5 days'))
  ORDER BY bt.created_at DESC;
 END IF;
 IF p_kind IS NULL OR p_kind='device' THEN
  RETURN QUERY SELECT 'device'::text,sd.id,'todo'::text,coalesce(nullif(sd.game_name,''),sd.device_type),
   coalesce(nullif(p.username,''),p.email),sd.created_at,NULL::timestamptz,NULL::uuid,NULL::text,NULL::text,
   sd.device_type,sd.game_id,sd.expires_at
  FROM public.shared_devices sd LEFT JOIN public.profiles p ON p.id=sd.owner_id
  WHERE sd.recipient_id=uid AND (sd.expires_at IS NULL OR sd.expires_at>now()) ORDER BY sd.created_at DESC;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.badges_get()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb; polls integer; bases integer; friends integer;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN jsonb_build_object('tasks_pending',0,'friends_pending',0); END IF;
 PERFORM public.poll_claim_email_records();
 SELECT count(*) INTO polls FROM public.poll_tasks t WHERE t.recipient_user_id=uid AND t.done_at IS NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL;
 SELECT count(*) INTO bases FROM public.base_share_tasks bt WHERE bt.recipient_user_id=uid AND bt.status IN('pending','opened');
 SELECT count(*) INTO friends FROM public.friendships f WHERE f.addressee_id=uid AND f.status='pending';
 RETURN jsonb_build_object('tasks_pending',polls+bases,'friends_pending',friends);
END $$;

CREATE OR REPLACE FUNCTION public.resource_copy_decide(p_offer uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE identity jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=auth.uid();
 IF NOT public._account_is_registered(auth.uid(),identity) THEN
  RETURN jsonb_build_object('ok',false,'error','auth_required');
 END IF;
 RETURN public._copy_decide(p_offer,p_decision);
END $$;

CREATE OR REPLACE FUNCTION public.resource_copy_history(p_kind text,p_source uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); identity jsonb; items jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=actor;
 IF NOT public._account_is_registered(actor,identity) THEN
  RETURN jsonb_build_object('ok',false,'error','auth_required','items','[]'::jsonb);
 END IF;
 IF p_kind='game' AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_source AND owner_id=actor)
  OR p_kind='logo' AND NOT EXISTS(SELECT 1 FROM public.user_logos WHERE id=p_source AND user_id=actor)
  OR p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('recipient_label',h.recipient_label,'sent_at',h.sent_at)
   ORDER BY h.sent_at DESC),'[]'::jsonb) INTO items FROM public.resource_copy_history h
  WHERE h.sender_id=actor AND h.sent_at>clock_timestamp()-interval '30 days'
   AND CASE p_kind WHEN 'game' THEN h.game_id ELSE h.logo_id END=p_source;
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;

CREATE OR REPLACE FUNCTION public.poll_share_panel(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb; g public.games%rowtype; fs jsonb; ss jsonb; ts jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN jsonb_build_object('ok',false,'err','registered_account_required'); END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid;
 IF NOT FOUND OR g.type::text NOT IN('poll_text','poll_points') THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,'email_enabled',public._contact_mail_enabled(f.email),
   'cooldown_until',public._poll_mail_cooldown_until(uid,f.user_id,f.email,p_game_id)) ORDER BY f.label),'[]'::jsonb) INTO fs
 FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'email',s.subscriber_email,'email_enabled',public._contact_mail_enabled(s.subscriber_email),
   'cooldown_until',public._poll_mail_cooldown_until(uid,NULL,s.subscriber_email,p_game_id)) ORDER BY s.subscriber_email),'[]'::jsonb) INTO ss
 FROM public.poll_subscriptions s WHERE s.owner_id=uid AND s.status='active' AND s.subscriber_user_id IS NULL
  AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'recipient_user_id',t.recipient_user_id,'recipient_email',t.recipient_email,
   'label',coalesce(nullif(p.username,''),public._norm_email(u.email),t.recipient_email),'status',t.status,'share_key_poll',t.share_key_poll,
   'reminder_count',t.reminder_count,'declined_at',t.declined_at,'cancelled_at',t.cancelled_at,
   'hidden',t.status='cancelled' OR (t.status='declined' AND t.declined_at<=now()-interval '5 days'),
   'email_enabled',public._contact_mail_enabled(coalesce(public._norm_email(u.email),t.recipient_email)),
   'cooldown_until',public._poll_mail_cooldown_until(uid,t.recipient_user_id,coalesce(public._norm_email(u.email),t.recipient_email),p_game_id))
   ORDER BY t.created_at DESC),'[]'::jsonb) INTO ts
 FROM public.poll_tasks t LEFT JOIN public.profiles p ON p.id=t.recipient_user_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id
 WHERE t.game_id=p_game_id AND t.owner_id=uid AND t.share_key_poll=g.share_key_poll AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL);
 RETURN jsonb_build_object('ok',true,'friends',fs,'subscribers',ss,'tasks',ts);
END $$;

CREATE OR REPLACE FUNCTION public.poll_share_send(p_game_id uuid,p_friend_ids uuid[],p_subscriber_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE identity jsonb; result jsonb; item jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=auth.uid();
 IF NOT public._account_is_registered(auth.uid(),identity) THEN RETURN jsonb_build_object('ok',false,'err','registered_account_required'); END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   result:=public._mail_original361_poll_share_send(p_game_id,p_friend_ids,p_subscriber_ids);
   IF result->>'ok'='true' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP
     PERFORM public._mail_allocate_notification('poll',(item->>'task_id')::uuid,'poll:share');
    END LOOP;
   END IF;
   RETURN result;
  EXCEPTION WHEN lock_not_available THEN IF attempt=1000 THEN RAISE; END IF; END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.polls_hub_share_poll(p_game_id uuid,p_sub_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE identity jsonb; result jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=auth.uid();
 IF NOT public._account_is_registered(auth.uid(),identity) THEN RETURN jsonb_build_object('ok',false,'err','registered_account_required'); END IF;
 result:=public.poll_share_send(p_game_id,'{}'::uuid[],p_sub_ids);
 RETURN result||jsonb_build_object('cancelled',0,'blocked_sub_ids','[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.poll_share_remind(p_game_id uuid,p_task_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE identity jsonb; result jsonb; item jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=auth.uid();
 IF NOT public._account_is_registered(auth.uid(),identity) THEN RETURN jsonb_build_object('ok',false,'err','registered_account_required'); END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   result:=public._mail_original361_poll_share_remind(p_game_id,p_task_id);
   IF result->>'ok'='true' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP
     PERFORM public._mail_allocate_notification('poll',(item->>'task_id')::uuid,'poll:share');
    END LOOP;
   END IF;
   RETURN result;
  EXCEPTION WHEN lock_not_available THEN IF attempt=1000 THEN RAISE; END IF; END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.poll_share_remove(p_game_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb; t public.poll_tasks%rowtype; g public.games%rowtype; voter text;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN jsonb_build_object('ok',false,'err','registered_account_required'); END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE id=p_task_id AND game_id=p_game_id AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','task_not_found'); END IF;
 voter:=public.poll_task_voter_token(t.id);
 DELETE FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=voter;
 DELETE FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=voter;
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=coalesce(cancelled_at,now()) WHERE id=t.id;
 RETURN jsonb_build_object('ok',true);
END $$;

-- Publikowanie w Marketplace jest udostępnieniem. Pozostałe widoki katalogu
-- i prywatnej biblioteki pozostają dostępne dla kont gości.
COMMIT;
