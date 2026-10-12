-- LOCAL DRAFT. Existing invitation RPCs reserve their existing budgets; only
-- their successful response creates one private permission to enqueue a mail.
CREATE TABLE public.mail_notification_allocations_prototype(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 lifecycle_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 identity_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 to_email text NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('friend','subscription','poll','base','device')),
 source_token uuid NOT NULL,
 friendship_id uuid REFERENCES public.friendships(id) ON DELETE CASCADE,
 subscription_id uuid REFERENCES public.poll_subscriptions(id) ON DELETE CASCADE,
 poll_task_id uuid REFERENCES public.poll_tasks(id) ON DELETE CASCADE,
 base_task_id uuid REFERENCES public.base_share_tasks(id) ON DELETE CASCADE,
 device_share_id uuid REFERENCES public.control_device_shares(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 enqueue_before timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 consumed_at timestamptz,
 consumed_queue_id uuid,
 revoked_at timestamptz,
 CHECK(num_nonnulls(friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id)=1),
 CHECK((consumed_at IS NULL)=(consumed_queue_id IS NULL))
);
ALTER TABLE public.mail_notification_allocations_prototype ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_notification_allocations_prototype FROM PUBLIC,anon,authenticated;
CREATE INDEX ON public.mail_notification_allocations_prototype(source_kind,source_token,created_at DESC) WHERE consumed_at IS NULL AND revoked_at IS NULL;
ALTER TABLE public.mail_queue ADD COLUMN notification_allocation_id uuid
 REFERENCES public.mail_notification_allocations_prototype(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ON public.mail_queue(notification_allocation_id) WHERE notification_allocation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._mail_notification_probe_prototype(p_kind text,p_id uuid,p_action text)
RETURNS public.mail_queue LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; info jsonb;
BEGIN
 q.created_by:=auth.uid(); q.notification_source_kind:=p_kind; q.cooldown_action_key:=p_action;
 CASE p_kind
  WHEN 'friend' THEN q.notification_friendship_id:=p_id;SELECT token INTO q.notification_source_token FROM public.friendships WHERE id=p_id;
  WHEN 'subscription' THEN q.notification_subscription_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_subscriptions WHERE id=p_id;
  WHEN 'poll' THEN q.notification_poll_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_tasks WHERE id=p_id;
  WHEN 'base' THEN q.notification_base_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.base_share_tasks WHERE id=p_id;
  WHEN 'device' THEN q.notification_device_share_id:=p_id;SELECT token INTO q.notification_source_token FROM public.control_device_shares WHERE id=p_id;
  ELSE RETURN NULL;
 END CASE;
 info:=public._mail_notification_source_info_prototype(q);
 IF info IS NULL THEN RETURN NULL; END IF;
 q.to_email:=info->>'email';
 q.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(q.to_email));
 RETURN q;
END $$;

CREATE OR REPLACE FUNCTION public._mail_allocate_notification_prototype(p_kind text,p_id uuid,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE q public.mail_queue; allocation_id uuid;
BEGIN
 -- Only called inside an already validated, budget-reserving invitation RPC.
 -- Do not acquire parents after its child locks; original RPC holds its roots.
 q:=public._mail_notification_probe_prototype(p_kind,p_id,p_action);
 IF q IS NULL THEN RETURN NULL; END IF;
 -- Serialize a flag change with minting. NOWAIT permits the RPC wrapper to
 -- release its source locks and retry rather than wait behind child-first code.
 PERFORM 1 FROM public.user_flags WHERE user_id=(q.notification_snapshot->>'identity_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=public._norm_email(q.to_email) FOR SHARE NOWAIT;
 IF q IS NULL OR NOT public._mail_notification_source_live_prototype(q) THEN RETURN NULL; END IF;
 -- A later successful reminder replaces an unused earlier enqueue permission.
 UPDATE public.mail_notification_allocations_prototype SET revoked_at=clock_timestamp()
  WHERE source_kind=p_kind AND source_token=q.notification_source_token
   AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.mail_notification_allocations_prototype(owner_id,lifecycle_owner_id,recipient_id,identity_id,to_email,source_kind,source_token,
  friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id,snapshot)
 VALUES(q.created_by,q.created_by,(q.notification_snapshot->>'recipient_id')::uuid,(q.notification_snapshot->>'identity_id')::uuid,q.to_email,p_kind,q.notification_source_token,
  q.notification_friendship_id,q.notification_subscription_id,q.notification_poll_task_id,q.notification_base_task_id,q.notification_device_share_id,q.notification_snapshot)
 RETURNING id INTO allocation_id;
 RETURN allocation_id;
END $$;
REVOKE ALL ON FUNCTION public._mail_notification_probe_prototype(text,uuid,text),public._mail_allocate_notification_prototype(text,uuid,text) FROM PUBLIC,anon,authenticated;
