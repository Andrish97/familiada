BEGIN;
-- E19 Go: expose the stored canonical account, without reassigning old addresses.
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
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at,ps.registered_user_id,ps.cancelled_at,ps.declined_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token AND (ps.declined_at IS NULL OR ps.declined_at>now()-interval '30 days') LIMIT 1;

  IF found THEN
    IF s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND NOT public._contact_mail_enabled(s.subscriber_email) THEN RETURN jsonb_build_object('ok',false,'error','revoked'); END IF;
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'registered_user_id', s.registered_user_id,
      'cancelled_at', s.cancelled_at, 'declined_at', s.declined_at,
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
    IF t.recipient_user_id IS NULL AND NOT public._contact_mail_enabled(t.recipient_email) THEN RETURN jsonb_build_object('ok',false,'error','revoked'); END IF;
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


COMMIT;
