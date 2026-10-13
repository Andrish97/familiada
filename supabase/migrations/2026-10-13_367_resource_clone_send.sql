-- E19C Send: recipient-owned offer mail source, Go resolver, inbox/history and counts.
BEGIN;

-- Mail source is the recipient-owned offer. Its FK/cascade follows the
-- recipient's copy; sender/source/friendship deletion cannot revoke it.
ALTER TABLE public.mail_queue DROP CONSTRAINT IF EXISTS mail_queue_notification_source_kind_check;
ALTER TABLE public.mail_queue ADD CONSTRAINT mail_queue_notification_source_kind_check
 CHECK(notification_source_kind IS NULL OR notification_source_kind IN('friend','subscription','poll','base','device','copy'));
ALTER TABLE public.mail_queue ADD COLUMN notification_copy_offer_id uuid REFERENCES public.resource_copy_offers(id) ON DELETE CASCADE;
CREATE INDEX ON public.mail_queue(notification_copy_offer_id) WHERE notification_copy_offer_id IS NOT NULL;
ALTER TABLE public.mail_notification_allocations ADD COLUMN copy_offer_id uuid REFERENCES public.resource_copy_offers(id) ON DELETE CASCADE;
ALTER TABLE public.mail_notification_allocations DROP CONSTRAINT IF EXISTS mail_notification_allocations_source_kind_check;
ALTER TABLE public.mail_notification_allocations ADD CONSTRAINT mail_notification_allocations_source_kind_check
 CHECK(source_kind IN('friend','subscription','poll','base','device','copy'));
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.mail_notification_allocations'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%num_nonnulls%' LOOP
  EXECUTE format('ALTER TABLE public.mail_notification_allocations DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.mail_notification_allocations ADD CONSTRAINT mail_notification_allocations_one_source
 CHECK(num_nonnulls(friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id,copy_offer_id)=1);
CREATE INDEX ON public.mail_notification_allocations(copy_offer_id) WHERE copy_offer_id IS NOT NULL;

INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce,description)
VALUES('copy:send','pair',0,false,'Powiadomienie o kopii; para i propozycja są ograniczone przez ofertę i podłogę baseline:recipient')
ON CONFLICT(action_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public._mail_notification_action_matches(p_kind text,p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(CASE p_kind WHEN 'friend' THEN p_action IN('friend:invite','friend:resend')
  WHEN 'subscription' THEN p_action IN('poll:invite','poll:resend') WHEN 'poll' THEN p_action='poll:share'
  WHEN 'base' THEN p_action='base:share' WHEN 'device' THEN p_action='device:share'
  WHEN 'copy' THEN p_action='copy:send' ELSE false END,false);
$$;
CREATE OR REPLACE FUNCTION public._mail_notification_source_info(q public.mail_queue)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb;
BEGIN
 CASE q.notification_source_kind
 WHEN 'friend' THEN
  SELECT jsonb_build_object('owner_id',CASE WHEN f.decision_user_id=f.requester_id THEN f.addressee_id ELSE f.requester_id END,
   'recipient_id',f.decision_user_id,'email',public._norm_email(u.email),'friendship_id',f.id,'subscription_id',f.source_subscription_id,
   'active',f.status='pending' AND f.cancelled_at IS NULL AND (f.source_subscription_id IS NULL OR EXISTS(
    SELECT 1 FROM public.poll_subscriptions s WHERE s.id=f.source_subscription_id AND s.owner_id=f.requester_id
     AND coalesce(s.registered_user_id,s.subscriber_user_id)=f.addressee_id AND s.status IN('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL)),
   'snapshot',jsonb_build_object('source_subscription_id',f.source_subscription_id)) INTO info
  FROM public.friendships f JOIN auth.users u ON u.id=f.decision_user_id WHERE f.id=q.notification_friendship_id AND f.token=q.notification_source_token;
 WHEN 'subscription' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',coalesce(s.registered_user_id,s.subscriber_user_id),'email',public._norm_email(s.subscriber_email),
   'subscription_id',s.id,'active',s.status='pending' AND s.cancelled_at IS NULL AND s.declined_at IS NULL AND s.subscriber_user_id IS NULL
    AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL,
   'snapshot',jsonb_build_object('subscriber_email',public._norm_email(s.subscriber_email))) INTO info
  FROM public.poll_subscriptions s WHERE s.id=q.notification_subscription_id AND s.token=q.notification_source_token;
 WHEN 'poll' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,'email',public._norm_email(CASE WHEN t.recipient_user_id IS NULL THEN t.recipient_email ELSE u.email END),
   'game_id',t.game_id,'friendship_id',t.source_friendship_id,'subscription_id',t.source_subscription_id,
   'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL AND g.owner_id=t.owner_id
    AND g.status::text='poll_open' AND g.type::text=t.poll_type AND g.share_key_poll=t.share_key_poll AND public._poll_task_source_active(t),
   'snapshot',jsonb_build_object('game_id',t.game_id,'poll_key',t.share_key_poll,'poll_type',t.poll_type)) INTO info
  FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id WHERE t.id=q.notification_poll_task_id AND t.token=q.notification_source_token;
 WHEN 'base' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,'email',public._norm_email(u.email),'base_id',t.base_id,
   'friendship_id',t.source_friendship_id,'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND t.created_at>clock_timestamp()-interval '5 days' AND b.owner_id=t.owner_id AND public._base_task_source_active(t),
   'snapshot',jsonb_build_object('base_id',t.base_id,'role',t.role)) INTO info
  FROM public.base_share_tasks t JOIN public.question_bases b ON b.id=t.base_id JOIN auth.users u ON u.id=t.recipient_user_id WHERE t.id=q.notification_base_task_id AND t.token=q.notification_source_token;
 WHEN 'device' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',s.recipient_id,'email',public._norm_email(CASE WHEN s.recipient_id IS NULL THEN s.recipient_email ELSE u.email END),
   'game_id',s.game_id,'session_id',s.session_id,'active',s.revoked_at IS NULL AND g.owner_id=s.owner_id AND rs.game_id=s.game_id AND rs.owner_id=s.owner_id
    AND rs.ended_at IS NULL AND rs.expires_at>clock_timestamp() AND rs.last_activity_at>clock_timestamp()-interval '1 hour',
   'snapshot',jsonb_build_object('game_id',s.game_id,'session_id',s.session_id,'device_type',s.device_type)) INTO info
  FROM public.control_device_shares s JOIN public.games g ON g.id=s.game_id JOIN public.control_runtime_sessions rs ON rs.id=s.session_id
   LEFT JOIN auth.users u ON u.id=s.recipient_id WHERE s.id=q.notification_device_share_id AND s.token=q.notification_source_token;
 WHEN 'copy' THEN
  SELECT jsonb_build_object('owner_id',o.sender_identity,'recipient_id',o.recipient_id,'email',public._norm_email(u.email),
   'active',o.status='pending' AND o.created_at+interval '5 days'>clock_timestamp(),
   'snapshot',jsonb_build_object('offer_id',o.id,'resource_kind',o.resource_kind,'name',o.name)) INTO info
  FROM public.resource_copy_offers o JOIN auth.users u ON u.id=o.recipient_id
  WHERE o.id=q.notification_copy_offer_id AND o.token=q.notification_source_token;
 ELSE RETURN NULL;
 END CASE;
 RETURN info;
END $$;
CREATE OR REPLACE FUNCTION public._mail_notification_source_live(q public.mail_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb; owner_id uuid; recipient_id uuid; mailbox text;
BEGIN
 IF NOT public._mail_notification_action_matches(q.notification_source_kind,q.cooldown_action_key) THEN RETURN false; END IF;
 info:=public._mail_notification_source_info(q);
 IF info IS NULL OR info->>'active' IS DISTINCT FROM 'true' OR q.notification_snapshot IS NULL THEN RETURN false; END IF;
 owner_id:=(info->>'owner_id')::uuid;recipient_id:=(info->>'recipient_id')::uuid;mailbox:=info->>'email';
 IF q.created_by IS DISTINCT FROM owner_id OR public._norm_email(q.to_email) IS DISTINCT FROM mailbox
  OR q.notification_snapshot->'resource' IS DISTINCT FROM info->'snapshot'
  OR (q.notification_snapshot->>'recipient_id')::uuid IS DISTINCT FROM recipient_id
  OR (q.notification_snapshot->>'identity_id')::uuid IS DISTINCT FROM public._poll_registered_uid(mailbox) THEN RETURN false; END IF;
 IF q.notification_source_kind<>'copy' AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=owner_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 IF recipient_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=recipient_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 RETURN public._contact_mail_enabled(mailbox);
END $$;
CREATE OR REPLACE FUNCTION public._mail_notification_probe(p_kind text,p_id uuid,p_action text)
RETURNS public.mail_queue LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; info jsonb;
BEGIN
 q.created_by:=auth.uid();q.notification_source_kind:=p_kind;q.cooldown_action_key:=p_action;
 CASE p_kind
  WHEN 'friend' THEN q.notification_friendship_id:=p_id;SELECT token INTO q.notification_source_token FROM public.friendships WHERE id=p_id;
  WHEN 'subscription' THEN q.notification_subscription_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_subscriptions WHERE id=p_id;
  WHEN 'poll' THEN q.notification_poll_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_tasks WHERE id=p_id;
  WHEN 'base' THEN q.notification_base_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.base_share_tasks WHERE id=p_id;
  WHEN 'device' THEN q.notification_device_share_id:=p_id;SELECT token INTO q.notification_source_token FROM public.control_device_shares WHERE id=p_id;
  WHEN 'copy' THEN q.notification_copy_offer_id:=p_id;SELECT token INTO q.notification_source_token FROM public.resource_copy_offers WHERE id=p_id;
  ELSE RETURN NULL;
 END CASE;
 info:=public._mail_notification_source_info(q);IF info IS NULL THEN RETURN NULL;END IF;
 q.to_email:=info->>'email';q.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(q.to_email));
 RETURN q;
END $$;
CREATE OR REPLACE FUNCTION public._mail_allocate_notification(p_kind text,p_id uuid,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue;allocation_id uuid;recipient uuid;
BEGIN
 q:=public._mail_notification_probe(p_kind,p_id,p_action);IF q IS NULL THEN RETURN NULL;END IF;
 recipient:=(q.notification_snapshot->>'recipient_id')::uuid;
 PERFORM 1 FROM public.user_flags WHERE user_id=(q.notification_snapshot->>'identity_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=public._norm_email(q.to_email) FOR SHARE NOWAIT;
 IF NOT public._mail_notification_source_live(q) THEN RETURN NULL;END IF;
 UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
  WHERE source_kind=p_kind AND source_token=q.notification_source_token AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.mail_notification_allocations(owner_id,lifecycle_owner_id,recipient_id,identity_id,to_email,source_kind,source_token,
  friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id,copy_offer_id,snapshot)
 VALUES(q.created_by,CASE WHEN p_kind='copy' THEN recipient ELSE q.created_by END,recipient,
  (q.notification_snapshot->>'identity_id')::uuid,q.to_email,p_kind,q.notification_source_token,
  q.notification_friendship_id,q.notification_subscription_id,q.notification_poll_task_id,q.notification_base_task_id,
  q.notification_device_share_id,q.notification_copy_offer_id,q.notification_snapshot) RETURNING id INTO allocation_id;
 RETURN allocation_id;
END $$;
CREATE OR REPLACE FUNCTION public.mail_queue_notification_source_bind()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb;allocation public.mail_notification_allocations;
BEGIN
 IF NEW.cooldown_action_key !~ '^(friend|poll|base|device|copy):' THEN
  IF NEW.created_by IS NOT NULL OR NEW.notification_source_kind IS NOT NULL OR NEW.notification_source_token IS NOT NULL OR NEW.notification_allocation_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.created_by IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.created_by)
  OR NEW.notification_source_token IS NULL OR NOT public._mail_notification_action_matches(NEW.notification_source_kind,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 NEW.notification_friendship_id:=NULL;NEW.notification_subscription_id:=NULL;NEW.notification_poll_task_id:=NULL;
 NEW.notification_base_task_id:=NULL;NEW.notification_device_share_id:=NULL;NEW.notification_copy_offer_id:=NULL;
 CASE NEW.notification_source_kind
  WHEN 'friend' THEN SELECT id INTO NEW.notification_friendship_id FROM public.friendships WHERE token=NEW.notification_source_token;
  WHEN 'subscription' THEN SELECT id INTO NEW.notification_subscription_id FROM public.poll_subscriptions WHERE token=NEW.notification_source_token;
  WHEN 'poll' THEN SELECT id INTO NEW.notification_poll_task_id FROM public.poll_tasks WHERE token=NEW.notification_source_token;
  WHEN 'base' THEN SELECT id INTO NEW.notification_base_task_id FROM public.base_share_tasks WHERE token=NEW.notification_source_token;
  WHEN 'device' THEN SELECT id INTO NEW.notification_device_share_id FROM public.control_device_shares WHERE token=NEW.notification_source_token;
  WHEN 'copy' THEN SELECT id INTO NEW.notification_copy_offer_id FROM public.resource_copy_offers WHERE token=NEW.notification_source_token;
 END CASE;
 info:=public._mail_notification_source_info(NEW);
 IF info IS NULL OR (info->>'owner_id')::uuid IS DISTINCT FROM NEW.created_by OR info->>'email' IS DISTINCT FROM public._norm_email(NEW.to_email) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 PERFORM public._mail_notification_source_lock(NEW);
 info:=public._mail_notification_source_info(NEW);
 NEW.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(NEW.to_email));
 IF NEW.notification_source_kind='device' AND (NEW.meta#>>'{notification_reference,device_type}' IS DISTINCT FROM info#>>'{snapshot,device_type}'
  OR NEW.meta#>>'{notification_reference,game_id}' IS DISTINCT FROM info#>>'{snapshot,game_id}') THEN RAISE EXCEPTION 'invalid_notification_reference'; END IF;
 IF NOT public._mail_notification_source_live(NEW) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 SELECT * INTO allocation FROM public.mail_notification_allocations a WHERE a.owner_id=NEW.created_by AND a.to_email=public._norm_email(NEW.to_email)
  AND a.source_kind=NEW.notification_source_kind AND a.source_token=NEW.notification_source_token
  AND a.friendship_id IS NOT DISTINCT FROM NEW.notification_friendship_id AND a.subscription_id IS NOT DISTINCT FROM NEW.notification_subscription_id
  AND a.poll_task_id IS NOT DISTINCT FROM NEW.notification_poll_task_id AND a.base_task_id IS NOT DISTINCT FROM NEW.notification_base_task_id
  AND a.device_share_id IS NOT DISTINCT FROM NEW.notification_device_share_id AND a.copy_offer_id IS NOT DISTINCT FROM NEW.notification_copy_offer_id
  AND a.snapshot=NEW.notification_snapshot AND a.consumed_at IS NULL AND a.revoked_at IS NULL AND a.enqueue_before>clock_timestamp()
  ORDER BY a.created_at DESC,a.id LIMIT 1 FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_notification_attempt'; END IF;
 UPDATE public.mail_notification_allocations SET consumed_at=clock_timestamp(),consumed_queue_id=NEW.id WHERE id=allocation.id;
 NEW.notification_allocation_id:=allocation.id;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public._mail_notification_queue_live(q public.mail_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF q.cooldown_action_key ~ '^(friend|poll|base|device|copy):' THEN
  RETURN public._mail_notification_source_live(q) AND EXISTS(SELECT 1 FROM public.mail_notification_allocations a WHERE a.id=q.notification_allocation_id
   AND a.consumed_queue_id=q.id AND a.consumed_at IS NOT NULL AND a.revoked_at IS NULL AND a.owner_id=q.created_by
   AND a.to_email=public._norm_email(q.to_email) AND a.source_kind=q.notification_source_kind AND a.source_token=q.notification_source_token
   AND a.snapshot=q.notification_snapshot AND a.friendship_id IS NOT DISTINCT FROM q.notification_friendship_id
   AND a.subscription_id IS NOT DISTINCT FROM q.notification_subscription_id AND a.poll_task_id IS NOT DISTINCT FROM q.notification_poll_task_id
   AND a.base_task_id IS NOT DISTINCT FROM q.notification_base_task_id AND a.device_share_id IS NOT DISTINCT FROM q.notification_device_share_id
   AND a.copy_offer_id IS NOT DISTINCT FROM q.notification_copy_offer_id);
 END IF;
 IF q.created_by IS NOT NULL OR q.notification_source_kind IS NOT NULL OR q.notification_allocation_id IS NOT NULL THEN RETURN false; END IF;
 IF q.cooldown_action_key='mail:center_verify' THEN RETURN public._mail_center_verification_live(q.mail_center_link_id,q.to_email); END IF;
 IF q.contact_source_expected OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id IS NOT NULL THEN
  RETURN public._mail_contact_source_live(q.contact_message_id,q.to_email,q.cooldown_action_key);
 END IF;
 RETURN public._contact_mail_enabled(q.to_email);
END $$;
CREATE OR REPLACE FUNCTION public._resource_copy_mail_epoch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.token IS DISTINCT FROM OLD.token OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN
  UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE copy_offer_id=OLD.id AND revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER resource_copy_mail_epoch AFTER UPDATE ON public.resource_copy_offers FOR EACH ROW EXECUTE FUNCTION public._resource_copy_mail_epoch();
CREATE FUNCTION public._resource_clone_check_assets(p_kind text,p_job uuid,p_definition jsonb,p_storage_base text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE ref text;
BEGIN
 IF p_kind='logo' THEN
  IF p_storage_base IS NULL OR p_storage_base !~ '^https://[a-zA-Z0-9.-]+$' THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
  FOR ref IN SELECT public._logo_clone_image_refs(p_definition#>'{payload,source}') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.resource_clone_assets a JOIN storage.objects o ON o.bucket_id='user-logos' AND o.name=a.destination_path
    WHERE a.job_id=p_job AND ref=p_storage_base||'/storage/v1/object/public/user-logos/'||a.destination_path AND
     o.metadata->>'mimetype'=a.mime AND (o.metadata->>'size')::bigint=a.byte_size AND
     (a.source_kind<>'storage' OR trim(both '"' from o.metadata->>'eTag')=a.etag)) THEN RAISE EXCEPTION 'unmaterialized_copy_image'; END IF;
  END LOOP;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_check_assets(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_send_name(p_kind text,p_owner uuid,p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original text:=left(trim(p_name),80); candidate text; number integer:=1; tail text;
BEGIN
 IF coalesce(original,'')='' OR p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'invalid_copy_name'; END IF;
 LOOP
  tail:=CASE WHEN number=1 THEN '' ELSE ' '||number::text END;
  candidate:=left(original,80-length(tail))||tail;
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE p_kind='game' AND owner_id=p_owner AND name=candidate) AND
     NOT EXISTS(SELECT 1 FROM public.user_logos WHERE p_kind='logo' AND user_id=p_owner AND name=candidate) THEN RETURN candidate; END IF;
  number:=number+1;
  IF number>10000 THEN RAISE EXCEPTION 'copy_name_unavailable'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_send_name(text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_finish_send(p_actor uuid,p_job uuid,p_definition jsonb,p_demo boolean,p_storage_base text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; existing public.resource_copy_offers; hash text; target uuid; offer_id uuid; offer_token uuid; allocation_id uuid;
 blocked_until timestamptz; imported jsonb; label text; receiver_label text; recipient_email text; key text[]; named jsonb; variant text;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'send' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users WHERE id IN(p_actor,item.recipient_id) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,item.recipient_id) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>2 THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job FOR UPDATE NOWAIT;
 key:=CASE item.resource_kind WHEN 'game' THEN ARRAY['game','name'] ELSE ARRAY['name'] END;
 hash:=encode(sha256(convert_to((p_definition #- key)::text,'UTF8')),'hex');
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND request_id=item.request_id;
 IF item.status='complete' THEN
  IF item.definition_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'request_conflict'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'previously_removed'; END IF;
  SELECT public._norm_email(u.email) INTO recipient_email FROM auth.users u WHERE u.id=item.recipient_id;
  RETURN jsonb_build_object('ok',true,'offer_id',existing.id,'go_token',existing.token,'mail_to',recipient_email,
   'mail_allowed',EXISTS(SELECT 1 FROM public.mail_notification_allocations a WHERE a.copy_offer_id=existing.id AND a.revoked_at IS NULL),'already',true);
 END IF;
 IF item.status IN('removed','expired') THEN RAISE EXCEPTION 'previously_removed'; END IF;
 IF item.created_at+interval '1 hour'<=clock_timestamp() THEN
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=p_job;
  PERFORM public._resource_clone_cleanup(item.recipient_id,p_job);
  RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF p_demo IS DISTINCT FROM false OR coalesce((item.source_snapshot->>'demo_origin')::boolean,false) OR coalesce((item.source_snapshot#>>ARRAY[item.resource_kind,'is_demo'])::boolean,false) THEN RAISE EXCEPTION 'demo_not_sendable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_actor,item.recipient_id)::text||':'||GREATEST(p_actor,item.recipient_id)::text,329));
 PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
  ((requester_id=p_actor AND addressee_id=item.recipient_id) OR (requester_id=item.recipient_id AND addressee_id=p_actor)) FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_friend'; END IF;
 SELECT max(decided_at+interval '30 days') INTO blocked_until FROM public.resource_copy_offers
  WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND source_id=item.source_id AND status='declined';
 IF blocked_until>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','declined_cooldown','cooldown_until',blocked_until); END IF;
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND source_id=item.source_id AND status='pending' FOR UPDATE;
 IF FOUND THEN
  IF existing.created_at+interval '5 days'>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','already_sent'); END IF;
  PERFORM public._copy_discard(existing.id,'expired');
 END IF;
 PERFORM public._resource_clone_check_assets(item.resource_kind,p_job,p_definition,p_storage_base);
 named:=jsonb_set(p_definition,key,to_jsonb(public._resource_clone_send_name(item.resource_kind,item.recipient_id,p_definition#>>key)));
 imported:=public._resource_clone_write(p_actor,item.recipient_id,item.resource_kind,'send',item.source_id,item.request_id,named,false);
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'clone_import_failed'; END IF;
 target:=(imported->>'id')::uuid;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=p_actor;
 SELECT coalesce(nullif(p.username,''),u.email),public._norm_email(u.email) INTO receiver_label,recipient_email FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=item.recipient_id;
 IF item.resource_kind='game' THEN
  UPDATE public.games SET received_from_label=label,received_from_identity=p_actor WHERE id=target;
  variant:=named#>>'{game,type}';
 ELSE
  UPDATE public.user_logos SET received_from_label=label,received_from_identity=p_actor WHERE id=target;
  variant:=named->>'type';
 END IF;
 INSERT INTO public.resource_copy_offers(recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,request_id,payload_hash,game_id,logo_id)
 VALUES(item.recipient_id,p_actor,p_actor,label,item.source_id,item.resource_kind,variant,named#>>key,item.request_id,hash,
  CASE WHEN item.resource_kind='game' THEN target END,CASE WHEN item.resource_kind='logo' THEN target END) RETURNING id,token INTO offer_id,offer_token;
 INSERT INTO public.resource_copy_history(sender_id,game_id,logo_id,offer_id,recipient_identity,recipient_label)
 VALUES(p_actor,CASE WHEN item.resource_kind='game' THEN item.source_id END,CASE WHEN item.resource_kind='logo' THEN item.source_id END,offer_id,item.recipient_id,receiver_label);
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 allocation_id:=public._mail_allocate_notification('copy',offer_id,'copy:send');
 UPDATE public.resource_clone_jobs SET status='complete',source_snapshot=NULL,definition_hash=hash,completed_at=clock_timestamp(),
  game_id=CASE WHEN resource_kind='game' THEN target END,logo_id=CASE WHEN resource_kind='logo' THEN target END WHERE id=p_job;
 UPDATE public.resource_clone_assets SET reference='' WHERE job_id=p_job;
 RETURN jsonb_build_object('ok',true,'offer_id',offer_id,'go_token',offer_token,'mail_to',recipient_email,'mail_allowed',allocation_id IS NOT NULL,'already',false);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_finish_send(uuid,uuid,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;

-- Before public Send, extend the existing pending guard to every operational
-- game descendant. Clone receipts/manifests and the offers themselves are
-- lifecycle metadata and must remain writable by the private transaction.
CREATE OR REPLACE FUNCTION public._copy_pending_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE ids uuid[]; question_ids uuid[]; old_row jsonb; new_row jsonb; kind text:='game';
BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME IN('games','user_logos') THEN
  ids:=ARRAY[(old_row->>'id')::uuid,(new_row->>'id')::uuid];
  IF TG_TABLE_NAME='user_logos' THEN kind:='logo'; END IF;
 ELSIF TG_TABLE_NAME='market_games' THEN
  ids:=ARRAY[(old_row->>'source_game_id')::uuid,(new_row->>'source_game_id')::uuid];
 ELSIF TG_TABLE_NAME='answers' THEN
  question_ids:=ARRAY[(old_row->>'question_id')::uuid,(new_row->>'question_id')::uuid];
  SELECT array_agg(game_id) INTO ids FROM public.questions WHERE id=ANY(question_ids);
 ELSE ids:=ARRAY[(old_row->>'game_id')::uuid,(new_row->>'game_id')::uuid]; END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers o JOIN auth.users u ON u.id=o.recipient_id
  WHERE o.status='pending' AND u.deleted_at IS NULL AND o.resource_kind=kind
   AND CASE kind WHEN 'game' THEN o.game_id ELSE o.logo_id END=ANY(ids)) THEN
  RAISE EXCEPTION 'received_copy_pending';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public._copy_pending_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER copy_pending_control_device_link_tokens BEFORE INSERT OR UPDATE OR DELETE ON public.control_device_link_tokens FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_control_device_shares BEFORE INSERT OR UPDATE OR DELETE ON public.control_device_shares FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_control_runtime_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.control_runtime_sessions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_device_connect_codes BEFORE INSERT OR UPDATE OR DELETE ON public.device_connect_codes FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_device_presence BEFORE INSERT OR UPDATE OR DELETE ON public.device_presence FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_display_audio_unlock BEFORE INSERT OR UPDATE OR DELETE ON public.display_audio_unlock FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_game_session_active BEFORE INSERT OR UPDATE OR DELETE ON public.game_session_active FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_game_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.game_sessions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_game_state_history BEFORE INSERT OR UPDATE OR DELETE ON public.game_state_history FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_anonymous_limits BEFORE INSERT OR UPDATE OR DELETE ON public.poll_anonymous_limits FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.poll_sessions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_tally_drafts BEFORE INSERT OR UPDATE OR DELETE ON public.poll_tally_drafts FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_tasks BEFORE INSERT OR UPDATE OR DELETE ON public.poll_tasks FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_text_entries BEFORE INSERT OR UPDATE OR DELETE ON public.poll_text_entries FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_votes BEFORE INSERT OR UPDATE OR DELETE ON public.poll_votes FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_shared_devices BEFORE INSERT OR UPDATE OR DELETE ON public.shared_devices FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_market_games BEFORE INSERT OR UPDATE OR DELETE ON public.market_games FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_user_market_library BEFORE INSERT OR UPDATE OR DELETE ON public.user_market_library FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();

-- Keep the offers private. Client RPCs expose only the signed-in recipient's
-- inbox, the sender's own short-lived history, and recipient-authorized decisions.
CREATE OR REPLACE FUNCTION public.resource_copy_inbox(p_kind text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); items jsonb;
BEGIN
 IF actor IS NULL OR NOT public._poll_identity_regular(actor,(SELECT to_jsonb(u) FROM auth.users u WHERE u.id=actor)) THEN
  RETURN jsonb_build_object('ok',false,'error','auth_required','items','[]'::jsonb);
 END IF;
 IF p_kind IS NOT NULL AND p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'invalid_copy_kind'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'resource_kind',o.resource_kind,'variant',o.variant,
  'logo_mode',CASE WHEN o.resource_kind='logo' THEN (SELECT CASE WHEN l.type='GLYPH_30x10' THEN 'TEXT' ELSE l.payload#>>'{source,mode}' END FROM public.user_logos l WHERE l.id=o.logo_id) END,
  'name',o.name,'sender_label',o.sender_label,'created_at',o.created_at,'expires_at',o.created_at+interval '5 days',
  'game_id',o.game_id,'logo_id',o.logo_id) ORDER BY o.created_at DESC),'[]'::jsonb)
 INTO items FROM public.resource_copy_offers o WHERE o.recipient_id=actor AND o.status='pending'
  AND o.created_at+interval '5 days'>clock_timestamp() AND (p_kind IS NULL OR o.resource_kind=p_kind);
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;
CREATE OR REPLACE FUNCTION public.resource_copy_decide(p_offer uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN RETURN public._copy_decide(p_offer,p_decision); END $$;

CREATE OR REPLACE FUNCTION public.resource_copy_history(p_kind text,p_source uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); items jsonb;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth_required','items','[]'::jsonb); END IF;
 IF p_kind='game' AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_source AND owner_id=actor)
  OR p_kind='logo' AND NOT EXISTS(SELECT 1 FROM public.user_logos WHERE id=p_source AND user_id=actor)
  OR p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('recipient_label',h.recipient_label,'sent_at',h.sent_at)
   ORDER BY h.sent_at DESC),'[]'::jsonb) INTO items FROM public.resource_copy_history h
  WHERE h.sender_id=actor AND h.sent_at>clock_timestamp()-interval '30 days'
   AND CASE p_kind WHEN 'game' THEN h.game_id ELSE h.logo_id END=p_source;
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;
CREATE OR REPLACE FUNCTION public.resource_copy_badges()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); items jsonb;
BEGIN
 IF actor IS NULL OR NOT public._poll_identity_regular(actor,(SELECT to_jsonb(u) FROM auth.users u WHERE u.id=actor)) THEN
  RETURN jsonb_build_object('ok',false,'items','[]'::jsonb);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',resource_kind,'variant',variant,'mode',mode,'count',n)),'[]'::jsonb)
 INTO items FROM (SELECT o.resource_kind,o.variant,
   CASE WHEN o.resource_kind='logo' THEN CASE WHEN l.type='GLYPH_30x10' THEN 'TEXT' ELSE coalesce(l.payload#>>'{source,mode}','DRAW') END END mode,
   count(*)::integer n FROM public.resource_copy_offers o LEFT JOIN public.user_logos l ON l.id=o.logo_id
  WHERE o.recipient_id=actor AND o.status='pending' AND o.created_at+interval '5 days'>clock_timestamp()
  GROUP BY o.resource_kind,o.variant,mode) counts;
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;
CREATE OR REPLACE FUNCTION public.resource_copy_go_resolve(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_copy_offers; actor uuid:=auth.uid(); recipient_email text; recipient_label text;
BEGIN
 SELECT * INTO item FROM public.resource_copy_offers WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 IF item.status='pending' AND item.created_at+interval '5 days'<=clock_timestamp() THEN
  PERFORM public._copy_discard(item.id,'expired');
  SELECT * INTO item FROM public.resource_copy_offers WHERE id=item.id;
 END IF;
 SELECT public._norm_email(u.email),coalesce(nullif(p.username,''),public._norm_email(u.email)) INTO recipient_email,recipient_label
  FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=item.recipient_id;
 RETURN jsonb_build_object('ok',true,'kind','copy','id',item.id,'status',item.status,'resource_kind',item.resource_kind,
  'name',item.name,'sender_label',item.sender_label,'recipient_email',recipient_email,
  'recipient_matches_me',actor=item.recipient_id,'recipient_label',recipient_label,
  'expires_at',item.created_at+interval '5 days');
END $$;
REVOKE ALL ON FUNCTION public.resource_copy_inbox(text),public.resource_copy_decide(uuid,text),public.resource_copy_history(text,uuid),public.resource_copy_badges(),public.resource_copy_go_resolve(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resource_copy_inbox(text),public.resource_copy_decide(uuid,text),public.resource_copy_history(text,uuid),public.resource_copy_badges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resource_copy_go_resolve(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public._resource_clone_check_assets(text,uuid,jsonb,text),public._resource_clone_finish_send(uuid,uuid,jsonb,boolean,text) TO service_role;
CREATE INDEX IF NOT EXISTS resource_copy_history_retention ON public.resource_copy_history(sent_at);
CREATE OR REPLACE FUNCTION public._resource_copy_history_gc() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE removed integer;
BEGIN DELETE FROM public.resource_copy_history WHERE sent_at<=clock_timestamp()-interval '30 days'; GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed; END $$;
REVOKE ALL ON FUNCTION public._resource_copy_history_gc() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._resource_copy_history_gc() TO service_role;
SELECT cron.schedule('resource-copy-history-gc','17 * * * *','SELECT public._resource_copy_history_gc();');
CREATE OR REPLACE FUNCTION public._resource_copy_offer_gc() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.resource_copy_offers; removed integer:=0;
BEGIN
 FOR item IN SELECT * FROM public.resource_copy_offers WHERE status='pending' AND created_at+interval '5 days'<=clock_timestamp() FOR UPDATE SKIP LOCKED LOOP
  PERFORM public._copy_discard(item.id,'expired');removed:=removed+1;
 END LOOP;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public._resource_copy_offer_gc() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._resource_copy_offer_gc() TO service_role;
SELECT cron.schedule('resource-copy-offer-gc','*/10 * * * *','SELECT public._resource_copy_offer_gc();');
COMMIT;
