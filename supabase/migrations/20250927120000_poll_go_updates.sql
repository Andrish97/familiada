-- Update poll_go helpers with owner/poll labels and email subscription fallback

CREATE OR REPLACE FUNCTION public.poll_go_resolve(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  t record;
begin
  -- 1) subscription token?
  select
    ps.id,
    ps.status,
    ps.owner_id,
    p.username as owner_label,
    ps.subscriber_user_id,
    ps.subscriber_email,
    ps.opened_at
  into s
  from public.poll_subscriptions ps
  left join public.profiles p on p.id = ps.owner_id
  where ps.token = p_token
  limit 1;

  if found then
    -- mark opened once
    if s.opened_at is null then
      update public.poll_subscriptions
        set opened_at = now()
      where id = s.id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'kind', 'sub',
      'sub_id', s.id,
      'status', s.status,
      'owner_id', s.owner_id,
      'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email
    );
  end if;

  -- 2) task token?
  select
    pt.id,
    pt.status,
    pt.owner_id,
    p.username as owner_label,
    pt.recipient_user_id,
    pt.recipient_email,
    pt.game_id,
    g.name as game_name,
    pt.poll_type,
    pt.share_key_poll,
    pt.opened_at
  into t
  from public.poll_tasks pt
  left join public.games g on g.id = pt.game_id
  left join public.profiles p on p.id = pt.owner_id
  where pt.token = p_token
  limit 1;

  if found then
    -- mark opened once (only for pending)
    if t.opened_at is null and t.status = 'pending' then
      update public.poll_tasks
        set status = 'opened',
            opened_at = now()
      where id = t.id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'kind', 'task',
      'task_id', t.id,
      'status', t.status,
      'owner_id', t.owner_id,
      'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id,
      'game_name', t.game_name,
      'poll_type', t.poll_type,
      'share_key_poll', t.share_key_poll
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'invalid_token');
end;
$function$;

CREATE OR REPLACE FUNCTION public.poll_go_subscribe_email(p_token uuid, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_email text;
  v_sub public.poll_subscriptions%rowtype;
begin
  v_email := lower(trim(coalesce(p_email,'')));

  if v_email = '' or position('@' in v_email) = 0 then
    return false;
  end if;

  select * into v_sub
  from public.poll_subscriptions s
  where s.token = p_token
  limit 1;

  if not found then
    return false;
  end if;

  if v_sub.status = 'pending'
     and v_sub.subscriber_user_id is null
     and v_sub.cancelled_at is null
     and v_sub.declined_at is null then
    if v_sub.subscriber_email is not null
       and public._norm_email(v_sub.subscriber_email) <> public._norm_email(v_email) then
      return false;
    end if;

    update public.poll_subscriptions s
       set subscriber_email = coalesce(s.subscriber_email, v_email),
           status = 'active',
           opened_at = coalesce(s.opened_at, now()),
           accepted_at = now()
     where s.id = v_sub.id;

    return found;
  end if;

  insert into public.poll_subscriptions (
    owner_id,
    subscriber_email,
    status,
    created_at,
    opened_at,
    accepted_at
  )
  values (
    v_sub.owner_id,
    v_email,
    'active',
    now(),
    now(),
    now()
  );

  return true;
end;
$function$;
