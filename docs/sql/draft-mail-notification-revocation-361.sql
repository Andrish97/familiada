-- LOCAL DRAFT. A closed source never revives an older enqueue/delivery grant.
-- These triggers only invalidate notification allocations. Auth mail is direct
-- and has no allocation, queue entry or notification preference dependency.
CREATE OR REPLACE FUNCTION public._mail_notification_fields_prototype(p_row jsonb,p_fields text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_object_agg(k,p_row->k),'{}'::jsonb) FROM unnest(p_fields) k;
$$;
CREATE OR REPLACE FUNCTION public.mail_notification_source_epoch_prototype()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE old_row jsonb:=to_jsonb(OLD); new_row jsonb:=to_jsonb(NEW); fields text[];
 kind text; revoke_own boolean; revoke_children boolean:=false; old_status text; new_status text;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'friendships' THEN
  kind:='friend'; fields:=ARRAY['requester_id','addressee_id','decision_user_id','token','source_subscription_id','cancelled_at','declined_at'];
  revoke_children:=NEW.status<>'active' OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL
   OR public._mail_notification_fields_prototype(old_row,fields) IS DISTINCT FROM public._mail_notification_fields_prototype(new_row,fields);
 WHEN 'poll_subscriptions' THEN
  kind:='subscription';fields:=ARRAY['owner_id','subscriber_email','subscriber_user_id','registered_user_id','token','cancelled_at','declined_at'];
  revoke_children:=NEW.status NOT IN('pending','active') OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL
   OR public._mail_notification_fields_prototype(old_row,fields) IS DISTINCT FROM public._mail_notification_fields_prototype(new_row,fields);
 WHEN 'poll_tasks' THEN
  kind:='poll';fields:=ARRAY['owner_id','recipient_user_id','recipient_email','token','game_id','share_key_poll','poll_type','source_kind','source_friendship_id','source_subscription_id','cancelled_at','declined_at'];
 WHEN 'base_share_tasks' THEN
  kind:='base';fields:=ARRAY['owner_id','recipient_user_id','token','base_id','role','source_kind','source_friendship_id','cancelled_at','declined_at'];
 WHEN 'control_device_shares' THEN
  kind:='device';fields:=ARRAY['owner_id','recipient_id','recipient_email','token','game_id','session_id','device_type','revoked_at'];
 END CASE;
 old_status:=old_row->>'status';new_status:=new_row->>'status';
 -- Opening an invitation does not consume or invalidate a notification.
 IF kind IN('poll','base') THEN
  IF old_status IN('pending','opened') THEN old_status:='live'; END IF;
  IF new_status IN('pending','opened') THEN new_status:='live'; END IF;
 END IF;
 revoke_own:=old_status IS DISTINCT FROM new_status
  OR public._mail_notification_fields_prototype(old_row,fields) IS DISTINCT FROM public._mail_notification_fields_prototype(new_row,fields);
 IF revoke_own THEN
  UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp()
   WHERE a.source_kind=kind AND a.source_token=(old_row->>'token')::uuid AND a.revoked_at IS NULL;
 END IF;
 IF revoke_children AND kind='friend' THEN
  UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL AND (
   EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.source_friendship_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.id=a.base_task_id AND t.source_friendship_id=OLD.id));
 ELSIF revoke_children AND kind='subscription' THEN
  UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL AND (
   EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.source_subscription_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=a.friendship_id AND f.source_subscription_id=OLD.id));
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.mail_notification_parent_epoch_prototype()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE old_row jsonb:=to_jsonb(OLD); new_row jsonb:=to_jsonb(NEW);
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'games' THEN
  IF public._mail_notification_fields_prototype(old_row,ARRAY['owner_id','type','status','share_key_poll'])
   IS DISTINCT FROM public._mail_notification_fields_prototype(new_row,ARRAY['owner_id','type','status','share_key_poll']) THEN
   UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.game_id=OLD.id);
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
   UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.control_device_shares s WHERE s.id=a.device_share_id AND s.game_id=OLD.id);
  END IF;
 WHEN 'question_bases' THEN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
   UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.id=a.base_task_id AND t.base_id=OLD.id);
  END IF;
 WHEN 'control_runtime_sessions' THEN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.ended_at IS NOT NULL
    OR NEW.expires_at<=clock_timestamp() OR NEW.last_activity_at<=clock_timestamp()-interval '1 hour' THEN
   UPDATE public.mail_notification_allocations_prototype a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.control_device_shares s WHERE s.id=a.device_share_id AND s.session_id=OLD.id);
  END IF;
 WHEN 'profiles' THEN
  IF NEW.is_guest IS DISTINCT FROM OLD.is_guest THEN
   UPDATE public.mail_notification_allocations_prototype SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
    AND (owner_id=NEW.id OR recipient_id=NEW.id OR identity_id=NEW.id);
  END IF;
 WHEN 'user_flags' THEN
  IF NEW.email_notifications IS FALSE THEN
   UPDATE public.mail_notification_allocations_prototype SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
    AND (recipient_id=NEW.user_id OR identity_id=NEW.user_id OR to_email=(SELECT public._norm_email(u.email) FROM auth.users u WHERE u.id=NEW.user_id));
  END IF;
 WHEN 'email_unsub_tokens' THEN
  IF TG_OP='UPDATE' AND public._norm_email(NEW.email) IS DISTINCT FROM public._norm_email(OLD.email) THEN
   UPDATE public.mail_notification_allocations_prototype SET revoked_at=clock_timestamp()
    WHERE revoked_at IS NULL AND to_email=public._norm_email(OLD.email);
  END IF;
  IF NEW.suppressed_at IS NOT NULL THEN
   UPDATE public.mail_notification_allocations_prototype SET revoked_at=clock_timestamp()
    WHERE revoked_at IS NULL AND to_email=public._norm_email(NEW.email);
  END IF;
 WHEN 'users' THEN
  IF public._norm_email(NEW.email) IS DISTINCT FROM public._norm_email(OLD.email)
    OR public._poll_identity_regular(NEW.id,to_jsonb(NEW)) IS DISTINCT FROM public._poll_identity_regular(OLD.id,to_jsonb(OLD)) THEN
   UPDATE public.mail_notification_allocations_prototype SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL AND (
    recipient_id=OLD.id OR identity_id=OLD.id OR to_email IN(public._norm_email(OLD.email),public._norm_email(NEW.email))
    OR (owner_id=OLD.id AND NOT public._poll_identity_regular(NEW.id,to_jsonb(NEW))));
  END IF;
 END CASE;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_fields_prototype(jsonb,text[]),public.mail_notification_source_epoch_prototype(),public.mail_notification_parent_epoch_prototype() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['friendships','poll_subscriptions','poll_tasks','base_share_tasks','control_device_shares'] LOOP
  EXECUTE format('CREATE TRIGGER trg_notification_source_epoch_prototype AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mail_notification_source_epoch_prototype()',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['games','question_bases','control_runtime_sessions'] LOOP
  EXECUTE format('CREATE TRIGGER trg_notification_parent_epoch_prototype AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch_prototype()',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['user_flags','email_unsub_tokens'] LOOP
  EXECUTE format('CREATE TRIGGER trg_notification_parent_epoch_prototype AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch_prototype()',table_name);
 END LOOP;
END $$;
CREATE TRIGGER trg_notification_auth_epoch_prototype AFTER UPDATE OF email,is_anonymous,email_confirmed_at,raw_user_meta_data ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch_prototype();

CREATE TRIGGER trg_notification_profile_epoch_prototype AFTER UPDATE OF is_guest ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.mail_notification_parent_epoch_prototype();
