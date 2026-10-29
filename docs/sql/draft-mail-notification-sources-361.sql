-- LOCAL DRAFT, not deployed. Structured source, permanent FK, no HTML backfill.
ALTER TABLE public.mail_queue
 ADD COLUMN notification_source_kind text CHECK(notification_source_kind IN('friend','subscription','poll','base','device')),
 ADD COLUMN notification_source_token uuid,
 ADD COLUMN notification_friendship_id uuid REFERENCES public.friendships(id) ON DELETE CASCADE,
 ADD COLUMN notification_subscription_id uuid REFERENCES public.poll_subscriptions(id) ON DELETE CASCADE,
 ADD COLUMN notification_poll_task_id uuid REFERENCES public.poll_tasks(id) ON DELETE CASCADE,
 ADD COLUMN notification_base_task_id uuid REFERENCES public.base_share_tasks(id) ON DELETE CASCADE,
 ADD COLUMN notification_device_share_id uuid REFERENCES public.control_device_shares(id) ON DELETE CASCADE,
 ADD COLUMN notification_snapshot jsonb;
CREATE INDEX ON public.mail_queue(notification_friendship_id) WHERE notification_friendship_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_subscription_id) WHERE notification_subscription_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_poll_task_id) WHERE notification_poll_task_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_base_task_id) WHERE notification_base_task_id IS NOT NULL;
CREATE INDEX ON public.mail_queue(notification_device_share_id) WHERE notification_device_share_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._mail_notification_action_matches_prototype(p_kind text,p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(CASE p_kind WHEN 'friend' THEN p_action IN('friend:invite','friend:resend')
  WHEN 'subscription' THEN p_action IN('poll:invite','poll:resend') WHEN 'poll' THEN p_action='poll:share'
  WHEN 'base' THEN p_action='base:share' WHEN 'device' THEN p_action='device:share' ELSE false END,false);
$$;

CREATE OR REPLACE FUNCTION public._mail_notification_source_info_prototype(q public.mail_queue)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb;
BEGIN
 CASE q.notification_source_kind
 WHEN 'friend' THEN
  SELECT jsonb_build_object('owner_id',CASE WHEN f.decision_user_id=f.requester_id THEN f.addressee_id ELSE f.requester_id END,
   'recipient_id',f.decision_user_id,'email',public._norm_email(u.email),
   'friendship_id',f.id,'subscription_id',f.source_subscription_id,
   'active',f.status='pending' AND f.cancelled_at IS NULL AND (f.source_subscription_id IS NULL
    OR EXISTS(SELECT 1 FROM public.poll_subscriptions s WHERE s.id=f.source_subscription_id AND s.owner_id=f.requester_id
      AND coalesce(s.registered_user_id,s.subscriber_user_id)=f.addressee_id
      AND s.status IN('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL)),
   'snapshot',jsonb_build_object('source_subscription_id',f.source_subscription_id)) INTO info
  FROM public.friendships f JOIN auth.users u ON u.id=f.decision_user_id
  WHERE f.id=q.notification_friendship_id AND f.token=q.notification_source_token;
 WHEN 'subscription' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',coalesce(s.registered_user_id,s.subscriber_user_id),
   'email',public._norm_email(s.subscriber_email),'subscription_id',s.id,
   'active',s.status='pending' AND s.cancelled_at IS NULL AND s.declined_at IS NULL
    AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL,
   'snapshot',jsonb_build_object('subscriber_email',public._norm_email(s.subscriber_email))) INTO info
  FROM public.poll_subscriptions s WHERE s.id=q.notification_subscription_id AND s.token=q.notification_source_token;
 WHEN 'poll' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,
   'email',public._norm_email(CASE WHEN t.recipient_user_id IS NULL THEN t.recipient_email ELSE u.email END),
   'game_id',t.game_id,'friendship_id',t.source_friendship_id,'subscription_id',t.source_subscription_id,
   'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND g.owner_id=t.owner_id AND g.status::text='poll_open' AND g.type::text=t.poll_type
    AND g.share_key_poll=t.share_key_poll AND public._poll_task_source_active(t),
   'snapshot',jsonb_build_object('game_id',t.game_id,'poll_key',t.share_key_poll,'poll_type',t.poll_type)) INTO info
  FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id
  WHERE t.id=q.notification_poll_task_id AND t.token=q.notification_source_token;
 WHEN 'base' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,'email',public._norm_email(u.email),
   'base_id',t.base_id,'friendship_id',t.source_friendship_id,
   'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND t.created_at>clock_timestamp()-interval '5 days' AND b.owner_id=t.owner_id AND public._base_task_source_active(t),
   'snapshot',jsonb_build_object('base_id',t.base_id,'role',t.role)) INTO info
  FROM public.base_share_tasks t JOIN public.question_bases b ON b.id=t.base_id JOIN auth.users u ON u.id=t.recipient_user_id
  WHERE t.id=q.notification_base_task_id AND t.token=q.notification_source_token;
 WHEN 'device' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',s.recipient_id,
   'email',public._norm_email(CASE WHEN s.recipient_id IS NULL THEN s.recipient_email ELSE u.email END),
   'game_id',s.game_id,'session_id',s.session_id,
   'active',s.revoked_at IS NULL AND g.owner_id=s.owner_id AND rs.game_id=s.game_id AND rs.owner_id=s.owner_id
    AND rs.ended_at IS NULL AND rs.expires_at>clock_timestamp() AND rs.last_activity_at>clock_timestamp()-interval '1 hour',
   'snapshot',jsonb_build_object('game_id',s.game_id,'session_id',s.session_id,'device_type',s.device_type)) INTO info
  FROM public.control_device_shares s JOIN public.games g ON g.id=s.game_id JOIN public.control_runtime_sessions rs ON rs.id=s.session_id
   LEFT JOIN auth.users u ON u.id=s.recipient_id
  WHERE s.id=q.notification_device_share_id AND s.token=q.notification_source_token;
 ELSE RETURN NULL;
 END CASE;
 RETURN info;
END $$;

CREATE OR REPLACE FUNCTION public._mail_notification_source_live_prototype(q public.mail_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE info jsonb; owner_id uuid; recipient_id uuid; mailbox text;
BEGIN
 IF NOT public._mail_notification_action_matches_prototype(q.notification_source_kind,q.cooldown_action_key) THEN RETURN false; END IF;
 info:=public._mail_notification_source_info_prototype(q);
 IF info IS NULL OR info->>'active' IS DISTINCT FROM 'true' OR q.notification_snapshot IS NULL THEN RETURN false; END IF;
 owner_id:=(info->>'owner_id')::uuid; recipient_id:=(info->>'recipient_id')::uuid; mailbox:=info->>'email';
 IF q.created_by IS DISTINCT FROM owner_id OR public._norm_email(q.to_email) IS DISTINCT FROM mailbox
   OR q.notification_snapshot->'resource' IS DISTINCT FROM info->'snapshot'
   OR (q.notification_snapshot->>'recipient_id')::uuid IS DISTINCT FROM recipient_id
   OR (q.notification_snapshot->>'identity_id')::uuid IS DISTINCT FROM public._poll_registered_uid(mailbox) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=owner_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 IF recipient_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=recipient_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 RETURN public._contact_mail_enabled(mailbox);
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_action_matches_prototype(text,text),public._mail_notification_source_info_prototype(public.mail_queue),public._mail_notification_source_live_prototype(public.mail_queue) FROM PUBLIC,anon,authenticated;
