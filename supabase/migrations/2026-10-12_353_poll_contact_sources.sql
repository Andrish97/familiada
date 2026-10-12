-- E19 pkt7: contact provenance is separate from recipient identity.
-- Never guess historical sources from email; explicit new grants track identity.
-- Completed votes survive cascades. Closed sources are not revived by friendship.
BEGIN;
DO $$ BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   LOCK auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.profiles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.friendships IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_subscriptions IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_tasks IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.mail_cooldowns IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.1);
 END LOOP;
END $$;
ALTER TABLE public.poll_subscriptions ADD COLUMN registered_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX poll_subscriptions_registered_user_idx ON public.poll_subscriptions(registered_user_id);
ALTER TABLE public.poll_subscriptions ADD COLUMN identity_tracking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.poll_subscriptions ALTER COLUMN identity_tracking_enabled SET DEFAULT true;
ALTER TABLE public.poll_tasks ADD COLUMN source_subscription_id uuid REFERENCES public.poll_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.poll_tasks ADD COLUMN source_friendship_id uuid REFERENCES public.friendships(id) ON DELETE CASCADE;
ALTER TABLE public.poll_tasks ADD COLUMN source_kind text NOT NULL DEFAULT 'game';
ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_one_contact_source CHECK(num_nonnulls(source_subscription_id,source_friendship_id)<=1);
CREATE INDEX poll_tasks_source_subscription_idx ON public.poll_tasks(source_subscription_id);
CREATE INDEX poll_tasks_source_friendship_idx ON public.poll_tasks(source_friendship_id);
ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_contact_kind CHECK
 ((source_subscription_id IS NOT NULL AND source_kind='subscriber') OR
  (source_friendship_id IS NOT NULL AND source_kind='friend') OR
  (source_subscription_id IS NULL AND source_friendship_id IS NULL AND source_kind='game'));
CREATE OR REPLACE FUNCTION public._friend_drop_pair_tasks(p_a uuid, p_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.poll_tasks pt
  WHERE pt.status IN ('pending', 'opened') AND pt.source_kind IN ('friend','game')
    AND ((pt.owner_id = p_a AND pt.recipient_user_id = p_b)
      OR (pt.owner_id = p_b AND pt.recipient_user_id = p_a));

  DELETE FROM public.base_share_tasks bt
  WHERE bt.status IN ('pending', 'opened')
    AND ((bt.owner_id = p_a AND bt.recipient_user_id = p_b)
      OR (bt.owner_id = p_b AND bt.recipient_user_id = p_a));
END;
$function$;
CREATE OR REPLACE FUNCTION public.friends_list()
 RETURNS TABLE(id uuid, user_id uuid, label text, email text, status text, direction text, created_at timestamp with time zone, accepted_at timestamp with time zone, email_sent_at timestamp with time zone, email_send_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT f.id,
         p.id,
         coalesce(nullif(p.username, ''), public._norm_email(u.email)),
         public._norm_email(u.email),
         f.status,
         CASE WHEN f.status = 'active' THEN 'friend'
              WHEN f.decision_user_id = v_uid THEN 'incoming'
              ELSE 'outgoing' END,
         f.created_at, f.accepted_at, f.email_sent_at, f.email_send_count
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END
  JOIN auth.users u ON u.id=p.id
  WHERE f.cancelled_at IS NULL AND (f.requester_id=v_uid OR f.addressee_id=v_uid)
    AND (f.status<>'declined' OR (f.declined_at>now()-interval '30 days'
      AND (f.decision_user_id=v_uid OR f.declined_at>now()-interval '5 days')))
  ORDER BY f.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public._subscriber_refusal_until(p_owner uuid, p_email text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH recipient AS (SELECT public._poll_registered_uid(p_email) AS id), relevant AS (
  SELECT s.* FROM public.poll_subscriptions s,recipient r WHERE s.owner_id=p_owner
  AND (s.registered_user_id=r.id OR s.subscriber_user_id=r.id
    OR(s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=public._norm_email(p_email)))
 ) SELECT greatest((SELECT max(declined_at)+interval '30 days' FROM relevant WHERE declined_at>now()-interval '30 days'),
  (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c,recipient r WHERE c.action_key='poll:invite_after_reject' AND c.next_allowed_at>now()
   AND(c.target_key='pair:'||p_owner::text||':email:'||md5(public._norm_email(p_email))
    OR c.target_key='pair:'||p_owner::text||':user:'||r.id::text)));
$function$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_resend(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid(); s public.poll_subscriptions%rowtype;
 v_to text; v_target text; v_ok boolean; v_until timestamptz; v_unsub uuid;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[s.subscriber_email],ARRAY[v_uid,s.subscriber_user_id,s.registered_user_id]);
 v_to:=public._norm_email(s.subscriber_email);
 IF v_to IS NULL AND s.subscriber_user_id IS NOT NULL THEN
   SELECT public._norm_email(email) INTO v_to FROM auth.users WHERE id=s.subscriber_user_id;
 END IF;
 IF v_to IS NULL THEN RETURN jsonb_build_object('ok',false,'err','no email for this subscriber'); END IF;
 -- Serialize the budget across separate historical rows for this same pair.
 PERFORM public._subscriber_pair_lock(v_uid,v_to);
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 IF s.status<>'pending' OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','only pending can be resent');
 END IF;
 IF s.registered_user_id IS NOT NULL OR s.subscriber_user_id IS NOT NULL OR public._poll_registered_uid(v_to) IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 v_until:=public._subscriber_refusal_until(v_uid,v_to);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','after_reject'); END IF;
 IF NOT public._contact_mail_enabled(v_to) THEN
   RETURN jsonb_build_object('ok',true,'mail_allowed',false);
 END IF;
 v_target:='pair:'||v_uid::text||':email:'||md5(v_to);
 v_until:=public._poll_sub_mail_limit_until(v_uid,NULL,v_to);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','mail_limit'); END IF;
 -- The first delivery follows the initial invitation reservation. Later ones
 -- must honor that reservation as well as the reminder reservation.
 IF s.email_send_count>0 THEN
   SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
   IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 END IF;
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:resend',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_reserve('poll:resend',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 UPDATE public.poll_subscriptions SET email_sent_at=now(),email_send_count=email_send_count+1 WHERE id=s.id;
 v_unsub:=public._ensure_unsub_token(v_to);
 RETURN jsonb_build_object('ok',true,'mail_allowed',true,'to',v_to,'kind','sub_invite',
   'link','/go/?s='||s.token,'token',s.token,'registered',false,'unsub_token',v_unsub);
END; $function$;
CREATE OR REPLACE FUNCTION public._subscriber_close(p_token uuid, p_allow_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.poll_subscriptions%rowtype; e text;
BEGIN
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT public._norm_email(coalesce(s.subscriber_email,p.email)) INTO e
 FROM (SELECT 1) x LEFT JOIN auth.users p ON p.id=s.subscriber_user_id;
 IF e IS NULL THEN RETURN false; END IF;
 IF s.registered_user_id IS NOT NULL AND auth.uid() IS DISTINCT FROM s.registered_user_id THEN RETURN false; END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[e],ARRAY[auth.uid(),s.owner_id,s.subscriber_user_id,s.registered_user_id]);
 PERFORM public._subscriber_pair_lock(s.owner_id,e);
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
 IF NOT FOUND OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL
 OR NOT (s.status='pending' OR (p_allow_active AND s.status='active')) THEN RETURN false; END IF;
 IF s.registered_user_id IS NOT NULL AND auth.uid() IS DISTINCT FROM s.registered_user_id THEN RETURN false; END IF;
 UPDATE public.poll_subscriptions SET status='declined',declined_at=now(),opened_at=coalesce(opened_at,now()) WHERE id=s.id;
 PERFORM public.mail_cooldown_reserve('poll:invite_after_reject','pair:'||s.owner_id::text||CASE WHEN s.registered_user_id IS NULL THEN ':email:'||md5(e) ELSE ':user:'||s.registered_user_id::text END);
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=now()
 WHERE owner_id=s.owner_id AND status IN ('pending','opened')
 AND (source_subscription_id=s.id OR (source_kind='game' AND ((s.subscriber_user_id IS NOT NULL AND recipient_user_id=s.subscriber_user_id) OR public._norm_email(recipient_email)=e)));
 RETURN true;
END; $function$;
CREATE OR REPLACE FUNCTION public.subscribers_list()
 RETURNS TABLE(id uuid, email text, status text, created_at timestamp with time zone, token uuid, email_sent_at timestamp with time zone, email_send_count integer, friend_user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id,coalesce((SELECT email FROM auth.users WHERE id=s.registered_user_id),s.subscriber_email),s.status,s.created_at,s.token,s.email_sent_at,s.email_send_count,
    coalesce(s.registered_user_id,public._poll_registered_uid(s.subscriber_email))
  FROM public.poll_subscriptions s
  WHERE s.owner_id=auth.uid() AND s.subscriber_user_id IS NULL AND (s.status IN ('pending','active') OR (s.status='declined' AND s.declined_at>now()-interval '5 days'))
  ORDER BY s.created_at DESC;
$function$;
CREATE OR REPLACE FUNCTION public.poll_sub_accept_email(p_token uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  e text := public._norm_email(p_email);
  s public.poll_subscriptions%rowtype;
  deadline timestamptz;
BEGIN
  IF e IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','missing_email');
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
  IF FOUND THEN
    PERFORM public._poll_identity_email_refs(ARRAY[s.subscriber_email],ARRAY[s.owner_id,s.subscriber_user_id,s.registered_user_id,auth.uid()]);
    PERFORM public._subscriber_pair_lock(s.owner_id,s.subscriber_email);
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token');
  END IF;
  IF s.subscriber_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','registered_invite_requires_login');
  END IF;
  IF s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL OR s.status NOT IN ('pending','active') THEN
    RETURN jsonb_build_object('ok',false,'error','already_closed');
  END IF;
  -- Match the address also on idempotent acceptance of an active invitation.
  IF public._norm_email(s.subscriber_email) IS DISTINCT FROM e THEN
    RETURN jsonb_build_object('ok',false,'error','email_mismatch');
  END IF;
  IF s.registered_user_id IS NOT NULL OR public._poll_registered_uid(e) IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','has_account');
  END IF;
  deadline:=public._subscriber_refusal_until(s.owner_id,e);
  IF deadline IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_until',deadline); END IF;
  IF s.status='active' THEN
    RETURN jsonb_build_object('ok',true,'kind','sub','action','accept','note','already_active');
  END IF;
  UPDATE public.poll_subscriptions SET status='active',
    accepted_at=coalesce(accepted_at,now()), opened_at=coalesce(opened_at,now())
    WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'kind','sub','action','accept');
END;
$function$;
CREATE OR REPLACE FUNCTION public.friends_invite(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_h        text := trim(coalesce(p_handle, ''));
  v_is_email boolean := position('@' in trim(coalesce(p_handle, ''))) > 1;
  v_prof     public.profiles%rowtype;
  v_ex       public.friendships%rowtype;
  v_target   text;
  v_auth_email text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_id       uuid;
  v_token    uuid;
  v_enabled boolean; v_prev_count integer:=0; v_prev_sent timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty handle');
  END IF;

  SELECT p.* INTO v_prof
  FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE ((v_is_email AND p.id=public._poll_registered_uid(v_h))
      OR (NOT v_is_email AND lower(p.username)=lower(v_h)))
    AND NOT p.is_guest AND public._norm_email(u.email) IS NOT NULL
    AND public._poll_identity_regular(u.id,to_jsonb(u));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'unknown_user', 'has_email_only', v_is_email);
  END IF;

  IF v_prof.id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'err', 'self');
  END IF;

  SELECT public._norm_email(email) INTO v_prof.email FROM auth.users WHERE id=v_prof.id;
  PERFORM public._poll_identity_email_refs(ARRAY[v_prof.email],ARRAY[v_uid,v_prof.id]);
  SELECT public._norm_email(email) INTO v_auth_email FROM auth.users WHERE id=v_prof.id;
  IF v_auth_email IS DISTINCT FROM v_prof.email OR
     (v_is_email AND public._poll_registered_uid(v_h) IS DISTINCT FROM v_prof.id) THEN
    RETURN jsonb_build_object('ok',false,'err','unknown_user','has_email_only',v_is_email);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(v_uid,v_prof.id)::text||':'||GREATEST(v_uid,v_prof.id)::text,329));
  PERFORM public._subscriber_pair_lock(v_uid,v_prof.email);
  v_cd_until:=public._subscriber_refusal_until(v_uid,v_prof.email);
  IF v_cd_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','after_reject');
  END IF;
  SELECT * INTO v_ex
  FROM public.friendships f
  WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(v_uid, v_prof.id)
    AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(v_uid, v_prof.id);

  -- Both directions refer to the same relationship and refusal.
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.cancelled_at IS NULL AND (v_ex.status<>'declined' OR v_ex.declined_at>now()-interval '30 days') THEN
      RETURN jsonb_build_object('ok',false,'err','already','id',v_ex.id,
        'status',v_ex.status,'direction',CASE WHEN v_ex.status='active' THEN 'friend'
          WHEN v_ex.decision_user_id=v_uid THEN 'incoming' ELSE 'outgoing' END);
    END IF;
    IF v_ex.declined_at>now()-interval '30 days' THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_ex.declined_at+interval '30 days','reason','after_reject');
    END IF;
    IF v_ex.email_sent_at>now()-interval '30 days' THEN
      v_prev_count:=v_ex.email_send_count; v_prev_sent:=v_ex.email_sent_at;
    END IF;
  END IF;
  v_target := 'pair:' || v_uid::text || ':' || v_prof.id::text;
  SELECT max(next_allowed_at) INTO v_cd_until FROM public.mail_cooldowns
   WHERE action_key='friend:invite_after_reject' AND next_allowed_at>now()
   AND target_key IN (v_target,'pair:'||v_prof.id||':'||v_uid);
  IF v_cd_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','after_reject');
  END IF;
  v_enabled:=public._contact_mail_enabled(v_prof.email);
  IF v_enabled THEN
    v_cd_until:=public._friend_mail_limit_until(v_uid,v_prof.id);
    IF v_cd_until>now() THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','mail_limit');
    END IF;
    SELECT greatest(max(next_allowed_at),v_prev_sent+interval '5 days') INTO v_cd_until
     FROM public.mail_cooldowns WHERE action_key IN ('friend:invite','friend:resend')
     AND target_key IN (v_target,'pair:'||v_prof.id||':'||v_uid);
    IF v_cd_until>now() THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','invite');
    END IF;
  END IF;
  -- Delete only after all checks; copy the still-valid budget to the new token.
  IF v_ex.id IS NOT NULL THEN DELETE FROM public.friendships WHERE id=v_ex.id; END IF;
  BEGIN
    INSERT INTO public.friendships(requester_id,addressee_id,status,email_sent_at,email_send_count)
    VALUES(v_uid,v_prof.id,'pending',CASE WHEN v_enabled THEN now() ELSE v_prev_sent END,
      v_prev_count+CASE WHEN v_enabled THEN 1 ELSE 0 END)
    RETURNING id,token INTO v_id,v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok',false,'err','already');
  END;
  IF v_enabled THEN PERFORM public.mail_cooldown_reserve('friend:invite',v_target); END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'to', v_prof.email, 'mail_allowed', v_enabled,
                            'accepted', false, 'status', 'pending');
END;
$function$;
CREATE OR REPLACE FUNCTION public.poll_go_resolve(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  t record;
  task public.poll_tasks%rowtype;
  u record;
  f record;
  b record;
BEGIN
  -- Znajomość przed subskrypcją: stare tokeny z maili kont skopiowano w 320.
  SELECT fs.id,fs.status,fs.requester_id,fs.decision_user_id AS addressee_id,p.username AS owner_label
  INTO f FROM public.friendships fs JOIN public.profiles p ON p.id=CASE WHEN fs.decision_user_id=fs.requester_id THEN fs.addressee_id ELSE fs.requester_id END
  WHERE fs.token=p_token AND fs.cancelled_at IS NULL AND (fs.status<>'declined' OR fs.declined_at>now()-interval '30 days') LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'kind','friend','id',f.id,'status',f.status,
      'owner_label',f.owner_label,'recipient_matches_me',auth.uid()=f.addressee_id);
  END IF;
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at,ps.registered_user_id
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token AND (ps.declined_at IS NULL OR ps.declined_at>now()-interval '30 days') LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email,
      'friend_conversion_required', s.registered_user_id IS NOT NULL OR s.subscriber_user_id IS NOT NULL OR public._poll_registered_uid(s.subscriber_email) IS NOT NULL
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.owner_id AS game_owner, g.type::text AS game_type,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    IF t.game_key IS NULL OR t.game_key IS DISTINCT FROM t.share_key_poll
      OR t.owner_id IS DISTINCT FROM t.game_owner OR t.poll_type IS DISTINCT FROM t.game_type THEN
      RETURN jsonb_build_object('ok',false,'error','expired');
    END IF;
    SELECT * INTO task FROM public.poll_tasks WHERE id=t.id;
    IF NOT FOUND OR NOT public._poll_task_source_active(task) THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
    IF t.recipient_user_id IS NULL THEN
      t.recipient_user_id:=public._poll_registered_uid(t.recipient_email);
    END IF;
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'poll_stopped' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      PERFORM public._poll_task_change(p_token,'open');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'task',
      'task_id', t.id, 'status', t.status,
      'owner_id', t.owner_id, 'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id, 'game_name', t.game_name,
      'poll_type', t.poll_type, 'share_key_poll', t.share_key_poll
    );
  END IF;

  -- Base shares: token is only a pointer to the logged-in recipient's task.
  SELECT bt.id, bt.status, bt.base_id, bt.recipient_user_id, bt.recipient_email,
         bt.owner_id, p.username AS owner_label
  INTO b
  FROM public.base_share_tasks bt
  LEFT JOIN public.profiles p ON p.id = bt.owner_id
  WHERE bt.token = p_token
    AND (bt.status NOT IN ('pending','opened','declined') OR coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')>now())
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'base', 'task_id', b.id, 'status', b.status,
      'base_id', b.base_id, 'recipient_user_id', b.recipient_user_id,
      'recipient_email', b.recipient_email, 'owner_id', b.owner_id,
      'owner_label', b.owner_label,
      'recipient_matches_me', auth.uid() = b.recipient_user_id
    );
  END IF;

  -- 3) global unsub token?
  SELECT email, suppressed_at INTO u
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF found THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'unsub',
      'already_suppressed', (u.suppressed_at IS NOT NULL)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
END;
$function$;
CREATE OR REPLACE FUNCTION public._poll_task_change(p_token uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t public.poll_tasks%rowtype; g public.games%rowtype; uid uuid:=auth.uid(); registered uuid;
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[auth.uid()]);
 IF p_action NOT IN ('open','decline','done') OR p_action IS NULL THEN RETURN 'invalid_action'; END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE token=p_token;
 IF NOT FOUND THEN RETURN 'not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=t.game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 'expired'; END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN 'not_found'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RETURN 'expired'; END IF;
 IF g.status::text='poll_stopped' THEN RETURN 'poll_stopped'; END IF;
 IF g.status::text='ready' THEN RETURN 'poll_closed'; END IF;
 IF g.status::text<>'poll_open' THEN RETURN 'expired'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF uid IS DISTINCT FROM t.recipient_user_id THEN RETURN 'not_your_task'; END IF;
 ELSE
  registered:=public._poll_registered_uid(t.recipient_email);
  IF registered IS NOT NULL AND uid IS DISTINCT FROM registered THEN RETURN 'not_your_task'; END IF;
  IF registered IS NOT NULL THEN UPDATE public.poll_tasks SET recipient_user_id=registered,recipient_email=NULL WHERE id=t.id; END IF;
 END IF;
 IF NOT public._poll_task_source_active(t) THEN RETURN 'expired'; END IF;
 IF p_action='done' AND t.status='done' AND t.done_at IS NOT NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL THEN RETURN 'ok'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RETURN 'already_used'; END IF;
 IF p_action='done' AND NOT public._poll_task_has_all_votes(t.id) THEN RETURN 'votes_incomplete'; END IF;
 IF p_action='decline' THEN
  DELETE FROM public.poll_votes WHERE game_id=t.game_id AND voter_token=public.poll_task_voter_token(t.id);
  DELETE FROM public.poll_text_entries WHERE game_id=t.game_id AND voter_token=public.poll_task_voter_token(t.id);
 END IF;
 UPDATE public.poll_tasks SET
  status=CASE p_action WHEN 'decline' THEN 'declined' WHEN 'done' THEN 'done' ELSE 'opened' END,
  opened_at=coalesce(opened_at,now()),
  declined_at=CASE WHEN p_action='decline' THEN coalesce(declined_at,now()) ELSE declined_at END,
  done_at=CASE WHEN p_action='done' THEN now() ELSE done_at END
 WHERE id=t.id;
 RETURN 'ok';
END; $function$;
CREATE OR REPLACE FUNCTION public._friend_locked(p_id uuid)
 RETURNS friendships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE f public.friendships%rowtype; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN (requester_id,addressee_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM public._poll_identity_refs(ARRAY[f.requester_id,f.addressee_id]);
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329));
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN (requester_id,addressee_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN f;
END $function$;
CREATE OR REPLACE FUNCTION public._poll_task_source_active(p_task poll_tasks)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT CASE p_task.source_kind
 WHEN 'subscriber' THEN EXISTS(SELECT 1 FROM public.poll_subscriptions s
  WHERE s.id=p_task.source_subscription_id AND s.owner_id=p_task.owner_id
  AND s.status='active' AND s.cancelled_at IS NULL AND s.declined_at IS NULL
  AND ((p_task.recipient_user_id IS NOT NULL AND coalesce(s.registered_user_id,s.subscriber_user_id)=p_task.recipient_user_id)
   OR (p_task.recipient_user_id IS NULL AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=public._norm_email(p_task.recipient_email))))
 WHEN 'friend' THEN EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=p_task.source_friendship_id
  AND f.status='active' AND f.cancelled_at IS NULL
  AND LEAST(f.requester_id,f.addressee_id)=LEAST(p_task.owner_id,p_task.recipient_user_id)
  AND GREATEST(f.requester_id,f.addressee_id)=GREATEST(p_task.owner_id,p_task.recipient_user_id))
 WHEN 'game' THEN true ELSE false END;
$function$;
CREATE OR REPLACE FUNCTION public.friends_resend(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_f        public.friendships%rowtype;
  v_to       text;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_lim      timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  v_f:=public._friend_locked(p_id);
  IF v_f.id IS NULL OR v_f.decision_user_id=v_uid OR v_f.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  IF v_f.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'err',CASE WHEN v_f.status='declined' THEN 'declined' ELSE 'not_pending' END);
  END IF;

  SELECT public._norm_email(u.email) INTO v_to FROM auth.users u WHERE u.id=v_f.decision_user_id;
  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok', true, 'mail_allowed', false);
  END IF;

  IF v_f.email_sent_at>now()-interval '5 days' THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_f.email_sent_at+interval '5 days');
  END IF;
  v_lim := public._friend_mail_limit_until(v_uid, v_f.decision_user_id);
  IF v_lim IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_f.decision_user_id::text;
  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:resend', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT public._norm_email(u.email) INTO v_to FROM auth.users u WHERE u.id=v_f.decision_user_id;
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this user');
  END IF;

  UPDATE public.friendships
     SET email_sent_at = now(), email_send_count = email_send_count + 1
   WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('friend:resend', v_target);

  RETURN jsonb_build_object('ok', true, 'to', v_to, 'kind', 'friend_invite',
                            'link', 'go?f=' || v_f.token::text, 'token', v_f.token);
END;
$function$;
CREATE OR REPLACE FUNCTION public.poll_share_panel(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); g public.games%rowtype; fs jsonb; ss jsonb; ts jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND OR g.type::text NOT IN ('poll_text','poll_points') THEN
  RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'email_enabled',public._contact_mail_enabled(f.email),
  'cooldown_until',public._poll_mail_cooldown_until(uid,f.user_id,f.email,p_game_id)) ORDER BY f.label),'[]'::jsonb)
 INTO fs FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'email',s.subscriber_email,
  'email_enabled',public._contact_mail_enabled(s.subscriber_email),
  'cooldown_until',public._poll_mail_cooldown_until(uid,NULL,s.subscriber_email,p_game_id)) ORDER BY s.subscriber_email),'[]'::jsonb)
 INTO ss FROM public.poll_subscriptions s WHERE s.owner_id=uid AND s.status='active' AND s.subscriber_user_id IS NULL
  AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'recipient_user_id',t.recipient_user_id,'recipient_email',t.recipient_email,
  'label',coalesce(nullif(p.username,''),public._norm_email(u.email),t.recipient_email),'status',t.status,'share_key_poll',t.share_key_poll,
  'reminder_count',t.reminder_count,'declined_at',t.declined_at,'cancelled_at',t.cancelled_at,
  'hidden',t.status='cancelled' OR (t.status='declined' AND t.declined_at<=now()-interval '5 days'),
  'email_enabled',public._contact_mail_enabled(coalesce(public._norm_email(u.email),t.recipient_email)),
  'cooldown_until',public._poll_mail_cooldown_until(uid,t.recipient_user_id,coalesce(public._norm_email(u.email),t.recipient_email),p_game_id))
 ORDER BY t.created_at DESC),'[]'::jsonb) INTO ts
 FROM public.poll_tasks t LEFT JOIN public.profiles p ON p.id=t.recipient_user_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id
 WHERE t.game_id=p_game_id AND t.owner_id=uid AND t.share_key_poll=g.share_key_poll
  AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL);
 RETURN jsonb_build_object('ok',true,'friends',fs,'subscribers',ss,'tasks',ts);
END; $function$;
CREATE OR REPLACE FUNCTION public._poll_assert_voter(p_game_id uuid, p_key text, p_voter_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.games%rowtype; t public.poll_tasks%rowtype; task_id uuid; registered uuid;
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[auth.uid()]);
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
 IF g.share_key_poll IS NULL OR g.share_key_poll IS DISTINCT FROM p_key THEN RAISE EXCEPTION 'Invalid poll key'; END IF;
 IF g.status::text<>'poll_open' THEN RAISE EXCEPTION 'Poll is not open'; END IF;
 IF p_voter_token IS NULL OR btrim(p_voter_token)='' THEN RAISE EXCEPTION 'Invalid voter token'; END IF;
 IF left(p_voter_token,5)<>'task:' THEN RETURN; END IF;
 BEGIN task_id:=substring(p_voter_token FROM 6)::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid task voter token'; END;
 SELECT * INTO t FROM public.poll_tasks WHERE id=task_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RAISE EXCEPTION 'Task expired'; END IF;
 IF NOT public._poll_task_source_active(t) THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF auth.uid() IS DISTINCT FROM t.recipient_user_id THEN RAISE EXCEPTION 'Not your task'; END IF;
 ELSE
  registered:=public._poll_registered_uid(t.recipient_email);
  IF registered IS NOT NULL AND auth.uid() IS DISTINCT FROM registered THEN RAISE EXCEPTION 'Not your task'; END IF;
  IF registered IS NOT NULL THEN UPDATE public.poll_tasks SET recipient_user_id=registered,recipient_email=NULL WHERE id=t.id; END IF;
 END IF;
END; $function$;
CREATE OR REPLACE FUNCTION public.poll_share_send(p_game_id uuid, p_friend_ids uuid[], p_subscriber_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_game public.games%rowtype; r record;
  v_target text; v_ok boolean; v_until timestamptz; v_id uuid; v_token uuid;
  v_mail_enabled boolean;
  v_created int:=0; v_kept int:=0; v_blocked int:=0; v_mail jsonb:='[]';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  PERFORM public._poll_share_contact_locks(v_uid,p_friend_ids,p_subscriber_ids);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','game not found'); END IF;
  IF v_game.type::text NOT IN ('poll_text','poll_points') OR v_game.status::text<>'poll_open' THEN
    RETURN jsonb_build_object('ok',false,'err','poll not open');
  END IF;
  FOR r IN
    SELECT p.id AS user_id,(SELECT public._norm_email(email) FROM auth.users WHERE id=p.id) AS email,NULL::uuid AS source_subscription_id FROM public.profiles p
      WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND NOT p.is_guest AND public.are_friends(v_uid,p.id)
    UNION
    SELECT NULL::uuid,lower(trim(s.subscriber_email)),s.id AS source_subscription_id FROM public.poll_subscriptions s
      WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[])) AND s.owner_id=v_uid
        AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND s.status='active'
        AND public._poll_registered_uid(s.subscriber_email) IS NULL
  LOOP
    IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.owner_id=v_uid AND t.game_id=p_game_id
      AND t.share_key_poll=v_game.share_key_poll AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL) AND (t.recipient_user_id=r.user_id OR lower(trim(t.recipient_email))=r.email)) THEN
      v_kept:=v_kept+1; CONTINUE;
    END IF;
    v_target:='pair:'||v_uid::text||':'||coalesce(r.user_id::text,'email:'||md5(r.email))||':game:'||p_game_id::text;
    v_mail_enabled:=public._contact_mail_enabled(r.email);
    IF v_mail_enabled THEN
    v_until:=public._poll_daily_cap_until(v_uid,r.email);
    SELECT ok INTO v_ok FROM public.mail_cooldown_check('poll:share',v_target);
    IF NOT v_ok OR v_until IS NOT NULL THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    SELECT ok INTO v_ok FROM public.mail_cooldown_reserve('poll:share',v_target);
    IF NOT v_ok THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    END IF;
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll,token,status,source_subscription_id)
      VALUES(v_uid,r.user_id,CASE WHEN r.user_id IS NULL THEN r.email END,p_game_id,v_game.type::text,v_game.share_key_poll,gen_random_uuid(),'pending',r.source_subscription_id)
      RETURNING id,token INTO v_id,v_token;
    v_created:=v_created+1;
    IF v_mail_enabled THEN
    v_mail:=v_mail||jsonb_build_array(jsonb_build_object('task_id',v_id,'to',r.email,'token',v_token,'link','/go/?t='||v_token::text));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'created',v_created,'kept',v_kept,'blocked',v_blocked,'mail',v_mail);
END; $function$;
CREATE OR REPLACE FUNCTION public._poll_bind_identity(p_uid uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; s record;
BEGIN
 IF public._norm_email(p_email) IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id<>p_uid AND public._norm_email(email)=public._norm_email(p_email)) THEN RETURN; END IF;
 -- Identity precedes contact locks, contact rows precede task rows.
 FOR s IN SELECT DISTINCT owner_id FROM public.poll_subscriptions
  WHERE registered_user_id IS NULL AND identity_tracking_enabled AND subscriber_user_id IS NULL
   AND public._norm_email(subscriber_email)=public._norm_email(p_email) ORDER BY owner_id LOOP
  PERFORM public._subscriber_pair_lock(s.owner_id,p_email);
 END LOOP;
 UPDATE public.poll_subscriptions SET registered_user_id=p_uid
  WHERE registered_user_id IS NULL AND identity_tracking_enabled AND subscriber_user_id IS NULL
   AND public._norm_email(subscriber_email)=public._norm_email(p_email);
 FOR r IN SELECT id FROM public.poll_tasks WHERE recipient_user_id IS NULL
  AND public._norm_email(recipient_email)=public._norm_email(p_email) ORDER BY game_id,id FOR UPDATE LOOP
  UPDATE public.poll_tasks SET recipient_user_id=p_uid,recipient_email=NULL WHERE id=r.id AND recipient_user_id IS NULL;
 END LOOP;
END $function$;
CREATE OR REPLACE FUNCTION public.friend_invites_from_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_created integer := 0;
  r         record;
  v_cd_ok   boolean;
  v_n       integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  v_email := public.poll_my_email();

  PERFORM public._poll_identity_email_refs(ARRAY[v_email],ARRAY[v_uid] || ARRAY(SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.registered_user_id = v_uid OR s.subscriber_user_id = v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled AND v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id));

  FOR r IN
    SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.registered_user_id = v_uid OR s.subscriber_user_id = v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled AND v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(r.owner_id,v_uid)::text||':'||GREATEST(r.owner_id,v_uid)::text,329));
    PERFORM public._subscriber_pair_lock(r.owner_id,v_email);
    IF public._subscriber_refusal_until(r.owner_id,v_email) IS NOT NULL THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(r.owner_id, v_uid)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(r.owner_id, v_uid)
    ) THEN
      CONTINUE;
    END IF;

    SELECT c.ok INTO v_cd_ok
    FROM public.mail_cooldown_check('friend:invite_after_reject', 'pair:' || r.owner_id::text || ':' || v_uid::text) c;
    IF NOT v_cd_ok THEN
      CONTINUE;
    END IF;

    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (r.owner_id, v_uid, 'pending')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_created := v_created + v_n;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$function$;
CREATE OR REPLACE FUNCTION public._subscriber_identity_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM public._poll_identity_email_refs(ARRAY[NEW.subscriber_email],ARRAY[NEW.owner_id,NEW.subscriber_user_id,auth.uid()]);
 NEW.registered_user_id:=coalesce(NEW.subscriber_user_id,public._poll_registered_uid(NEW.subscriber_email));
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.subscribers_invite(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_uid uuid:=auth.uid(); v_email text:=public._norm_email(p_email);
 v_id uuid; v_token uuid; v_ok boolean; v_until timestamptz; v_target text; v_enabled boolean;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[v_email],ARRAY[v_uid]);
 IF v_email IS NULL OR v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' THEN
   RETURN jsonb_build_object('ok',false,'err','invalid_email');
 END IF;
 IF public._poll_registered_uid(v_email) IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 PERFORM public._subscriber_pair_lock(v_uid,v_email);
 SELECT id,token INTO v_id,v_token FROM public.poll_subscriptions
   WHERE owner_id=v_uid AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND lower(trim(subscriber_email))=v_email
     AND status IN ('pending','active') LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true,'id',v_id,'token',v_token); END IF;
 v_until:=public._subscriber_refusal_until(v_uid,v_email);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','after_reject'); END IF;
 v_target:='pair:'||v_uid::text||':email:'||md5(v_email);
 -- The refusal window is relational and applies also when mail is disabled.
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite_after_reject',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 v_enabled:=public._contact_mail_enabled(v_email);
 IF v_enabled THEN
   v_until:=public._poll_sub_mail_limit_until(v_uid,NULL,v_email);
   IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
   SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
   IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status)
   VALUES(v_uid,v_email,'pending') RETURNING id,token INTO v_id,v_token;
 IF v_enabled THEN PERFORM public.mail_cooldown_reserve('poll:invite',v_target); END IF;
 RETURN jsonb_build_object('ok',true,'already',false,'id',v_id,'token',v_token,'mail_allowed',v_enabled);
END; $function$;
CREATE OR REPLACE FUNCTION public._subscriber_identity_refusal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE holder uuid:=coalesce(NEW.registered_user_id,NEW.subscriber_user_id); old_key text; new_key text; deadline timestamptz;
BEGIN
 IF holder IS NULL THEN RETURN NEW; END IF;
 old_key:='pair:'||NEW.owner_id::text||':email:'||md5(public._norm_email(NEW.subscriber_email));
 new_key:='pair:'||NEW.owner_id::text||':user:'||holder::text;
 SELECT greatest(NEW.declined_at+interval '30 days',max(next_allowed_at)) INTO deadline
  FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject' AND target_key=old_key;
 IF deadline IS NOT NULL THEN
  INSERT INTO public.mail_cooldowns(action_key,target_key,next_allowed_at)
  VALUES('poll:invite_after_reject',new_key,deadline)
  ON CONFLICT(action_key,target_key) DO UPDATE SET next_allowed_at=greatest(public.mail_cooldowns.next_allowed_at,excluded.next_allowed_at),updated_at=now();
  IF NOT EXISTS(SELECT 1 FROM public.poll_subscriptions s WHERE s.owner_id=NEW.owner_id
    AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL
    AND public._norm_email(s.subscriber_email)=public._norm_email(NEW.subscriber_email)
    AND s.declined_at>now()-interval '30 days') THEN
   DELETE FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject' AND target_key=old_key;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public._subscriber_identity_account_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 DELETE FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject'
  AND (target_key LIKE 'pair:'||OLD.id::text||':%' OR target_key LIKE 'pair:%:user:'||OLD.id::text);
 RETURN OLD;
END $function$;
CREATE OR REPLACE FUNCTION public._poll_identity_task_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE holder uuid; src public.poll_subscriptions%rowtype; ids uuid[];
BEGIN
 PERFORM public._poll_identity_email_refs(ARRAY[NEW.recipient_email],ARRAY[NEW.owner_id,NEW.recipient_user_id,auth.uid()]);
 IF NEW.source_subscription_id IS NOT NULL THEN
  SELECT * INTO src FROM public.poll_subscriptions WHERE id=NEW.source_subscription_id FOR SHARE;
  IF NOT FOUND OR src.owner_id IS DISTINCT FROM NEW.owner_id OR src.status<>'active' OR src.cancelled_at IS NOT NULL OR src.declined_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid contact source'; END IF;
  holder:=coalesce(src.registered_user_id,src.subscriber_user_id,public._poll_registered_uid(src.subscriber_email));
  IF NEW.recipient_user_id IS NOT NULL AND holder IS DISTINCT FROM NEW.recipient_user_id THEN RAISE EXCEPTION 'Wrong contact recipient'; END IF;
  IF NEW.recipient_email IS NOT NULL AND (public._norm_email(NEW.recipient_email) IS DISTINCT FROM public._norm_email(src.subscriber_email)
    OR(holder IS NOT NULL AND holder IS DISTINCT FROM public._poll_registered_uid(NEW.recipient_email))) THEN RAISE EXCEPTION 'Wrong contact recipient'; END IF;
  UPDATE public.poll_subscriptions SET identity_tracking_enabled=true,registered_user_id=coalesce(registered_user_id,holder) WHERE id=src.id AND (NOT identity_tracking_enabled OR (registered_user_id IS NULL AND holder IS NOT NULL));
 ELSIF NEW.recipient_user_id IS NOT NULL AND NEW.source_friendship_id IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(NEW.owner_id,NEW.recipient_user_id)::text||':'||GREATEST(NEW.owner_id,NEW.recipient_user_id)::text,329));
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.friendships WHERE status='active'
   AND((requester_id=NEW.owner_id AND addressee_id=NEW.recipient_user_id) OR(addressee_id=NEW.owner_id AND requester_id=NEW.recipient_user_id));
  IF cardinality(ids)>1 THEN RAISE EXCEPTION 'Ambiguous friendship source'; END IF;
  NEW.source_friendship_id:=ids[1];
 END IF;
 IF NEW.recipient_user_id IS NULL AND NEW.recipient_email IS NOT NULL THEN
  holder:=public._poll_registered_uid(NEW.recipient_email);
  IF holder IS NOT NULL THEN NEW.recipient_user_id:=holder;NEW.recipient_email:=NULL; END IF;
 END IF;
 IF NEW.source_friendship_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.friendships
  WHERE id=NEW.source_friendship_id AND status='active' AND cancelled_at IS NULL AND ((requester_id=NEW.owner_id AND addressee_id=NEW.recipient_user_id) OR(addressee_id=NEW.owner_id AND requester_id=NEW.recipient_user_id))) THEN RAISE EXCEPTION 'Invalid friendship source'; END IF;
 NEW.source_kind:=CASE WHEN NEW.source_subscription_id IS NOT NULL THEN 'subscriber' WHEN NEW.source_friendship_id IS NOT NULL THEN 'friend' ELSE 'game' END;
 IF NOT public._poll_task_source_active(NEW) THEN RAISE EXCEPTION 'Invalid contact source'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_remove(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sub public.poll_subscriptions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  select * into v_sub
  from public.poll_subscriptions
  where id = p_id
    and owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;

  PERFORM public._poll_identity_email_refs(ARRAY[v_sub.subscriber_email],ARRAY[v_uid,v_sub.subscriber_user_id,v_sub.registered_user_id]);
  PERFORM public._subscriber_pair_lock(v_uid,v_sub.subscriber_email);
  SELECT * INTO v_sub FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not found'); END IF;
  -- ✅ zamiast DELETE: oznacz jako cancelled i ustaw timestamp
  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id;

  -- E11b: usunięcie subskrybenta wycofuje jego czekające zaproszenia do ankiet tego właściciela
  delete from public.poll_tasks pt
  where pt.owner_id = v_uid
    and pt.status in ('pending', 'opened')
    and (pt.source_subscription_id=v_sub.id OR (pt.source_kind='game' AND ((v_sub.subscriber_user_id is not null and pt.recipient_user_id=v_sub.subscriber_user_id) OR (v_sub.subscriber_email is not null and public._norm_email(pt.recipient_email)=public._norm_email(v_sub.subscriber_email)))));

  return jsonb_build_object('ok', true);
end;
$function$;
CREATE OR REPLACE FUNCTION public.poll_share_remind(p_game_id uuid, p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  g record;
  t public.poll_tasks%rowtype;
  v_to text;
  v_target text;
  v_ok boolean;
  v_until timestamptz;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  SELECT * INTO t FROM public.poll_tasks WHERE id=p_task_id AND game_id=p_game_id AND owner_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  PERFORM public._poll_identity_email_refs(ARRAY[t.recipient_email],ARRAY[v_uid,t.recipient_user_id]);
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT id, name, status::text AS status, share_key_poll INTO g
  FROM public.games WHERE id = p_game_id FOR UPDATE;

  IF g.status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  SELECT * INTO t FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;
  IF t.status NOT IN ('pending', 'opened') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task not pending');
  END IF;
  IF t.share_key_poll IS DISTINCT FROM g.share_key_poll THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task expired');
  END IF;

  IF NOT public._poll_task_source_active(t) THEN RETURN jsonb_build_object('ok',false,'err','task expired'); END IF;
  v_to:=public._norm_email(coalesce(t.recipient_email,(SELECT u.email FROM auth.users u WHERE u.id=t.recipient_user_id)));
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this recipient');
  END IF;

  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok',true,'mail_allowed',false,'mail','[]'::jsonb);
  END IF;
  IF t.reminder_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'err', 'reminder limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(t.recipient_user_id::text, 'email:' || md5(lower(coalesce(t.recipient_email, '')))) ||
    ':game:' || p_game_id::text;

  SELECT c.ok, c.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_check('poll:share', v_target) c;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  v_until := public._poll_daily_cap_until(v_uid, v_to);
  IF v_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until, 'reason', 'daily_cap');
  END IF;

  SELECT r.ok, r.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_reserve('poll:share', v_target) r;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  UPDATE public.poll_tasks SET reminder_count = reminder_count + 1 WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text,
    'game_name', g.name, 'poll_type', t.poll_type,
    'reminder_count', t.reminder_count + 1,
    'mail', jsonb_build_array(jsonb_build_object(
      'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text))
  );
END $function$;
CREATE OR REPLACE FUNCTION public._friend_accept_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record;
BEGIN
 IF NEW.status='active' THEN
  FOR r IN SELECT s.id,s.owner_id,p.id AS peer FROM public.poll_subscriptions s
   JOIN public.profiles p ON (s.owner_id=NEW.requester_id AND p.id=NEW.addressee_id)
      OR (s.owner_id=NEW.addressee_id AND p.id=NEW.requester_id)
   WHERE s.status IN ('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL AND (s.registered_user_id=p.id OR s.subscriber_user_id=p.id
    OR EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.source_subscription_id=s.id AND t.recipient_user_id=p.id)
    OR (s.identity_tracking_enabled AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=(SELECT public._norm_email(email) FROM auth.users WHERE id=p.id)
      AND NOT EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.source_subscription_id=s.id AND t.recipient_user_id IS NOT NULL AND t.recipient_user_id<>p.id))
   ) ORDER BY s.owner_id,s.id LOOP
   UPDATE public.poll_tasks SET source_subscription_id=NULL,source_friendship_id=NEW.id,source_kind='friend',recipient_user_id=r.peer,recipient_email=NULL
    WHERE source_subscription_id=r.id AND owner_id=r.owner_id AND (recipient_user_id IS NULL OR recipient_user_id=r.peer);
   DELETE FROM public.poll_subscriptions WHERE id=r.id;
  END LOOP;
 END IF;
 RETURN NEW;
END $function$;
CREATE TRIGGER subscriber_identity_account_delete AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION _subscriber_identity_account_delete();
CREATE TRIGGER subscriber_identity_insert BEFORE INSERT ON public.poll_subscriptions FOR EACH ROW EXECUTE FUNCTION _subscriber_identity_insert();
CREATE TRIGGER subscriber_identity_refusal AFTER INSERT OR UPDATE OF registered_user_id, declined_at ON public.poll_subscriptions FOR EACH ROW EXECUTE FUNCTION _subscriber_identity_refusal();
REVOKE ALL ON FUNCTION public._subscriber_identity_insert() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._subscriber_identity_refusal() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._subscriber_identity_account_delete() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._poll_task_source_active(public.poll_tasks) FROM PUBLIC,anon,authenticated;
COMMIT;
