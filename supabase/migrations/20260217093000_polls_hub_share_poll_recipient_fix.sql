-- Fix polls_hub_share_poll for subscribers linked by user_id.
-- poll_tasks has CHECK requiring exactly one recipient field:
-- (recipient_user_id IS NOT NULL, recipient_email IS NULL) OR vice-versa.
-- When subscriber_user_id existed, the function still inserted resolved_email,
-- which violates poll_tasks_one_recipient_chk and causes RPC 400.

begin;

create or replace function public.polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_share_key text;
  v_created int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_blocked int := 0;
  v_blocked_sub_ids uuid[] := array[]::uuid[];
  v_mail jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  select g.type::text, g.share_key_poll
    into v_poll_type, v_share_key
  from public.games g
  where g.id = p_game_id and g.owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'game not found');
  end if;

  if v_poll_type not in ('poll_text','poll_points') then
    return jsonb_build_object('ok', false, 'error', 'not a poll game');
  end if;

  update public.poll_tasks t
  set status = 'cancelled',
      cancelled_at = now()
  where t.owner_id = v_uid
    and t.game_id = p_game_id
    and t.status in ('pending','opened')
    and (
      (t.recipient_user_id is not null and not exists (
        select 1
        from public.poll_subscriptions s
        where s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
          and s.owner_id = v_uid
          and s.status = 'active'
          and s.subscriber_user_id = t.recipient_user_id
      ))
      or
      (t.recipient_user_id is null and t.recipient_email is not null and not exists (
        select 1
        from public.poll_subscriptions s
        where s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
          and s.owner_id = v_uid
          and s.status = 'active'
          and s.subscriber_email is not null
          and lower(s.subscriber_email) = lower(t.recipient_email)
      ))
    );

  get diagnostics v_cancelled = row_count;

  with sel as (
    select
      s.id as sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) as subscriber_email,
      lower(p.email) as subscriber_profile_email,
      lower(coalesce(s.subscriber_email, p.email)) as resolved_email
    from public.poll_subscriptions s
    left join public.profiles p on p.id = s.subscriber_user_id
    where s.owner_id = v_uid
      and s.status = 'active'
      and s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
  ),
  cooldown as (
    select
      sel.sub_id,
      max(coalesce(t.cancelled_at, t.declined_at, t.created_at)) as last_block_ts
    from sel
    join public.poll_tasks t
      on t.owner_id = v_uid
     and t.game_id = p_game_id
     and t.status in ('cancelled','declined')
     and (
        (sel.subscriber_user_id is not null and t.recipient_user_id = sel.subscriber_user_id)
        or
        (sel.subscriber_user_id is null and sel.subscriber_email is not null and lower(t.recipient_email) = sel.subscriber_email)
     )
    where coalesce(t.cancelled_at, t.declined_at, t.created_at) > now() - interval '24 hours'
    group by sel.sub_id
  ),
  existing as (
    select
      sel.sub_id,
      t.id as task_id
    from sel
    left join public.poll_tasks t
      on t.owner_id = v_uid
     and t.game_id = p_game_id
     and t.status in ('pending','opened','done')
     and (
        (sel.subscriber_user_id is not null and t.recipient_user_id = sel.subscriber_user_id)
        or
        (sel.subscriber_user_id is null and sel.subscriber_email is not null and lower(t.recipient_email) = sel.subscriber_email)
     )
  ),
  ins as (
    insert into public.poll_tasks(
      owner_id, recipient_user_id, recipient_email,
      game_id, poll_type, share_key_poll, token, status, created_at
    )
    select
      v_uid,
      e.subscriber_user_id,
      case
        when e.subscriber_user_id is not null then null
        else e.resolved_email
      end,
      p_game_id,
      v_poll_type,
      v_share_key,
      gen_random_uuid(),
      'pending',
      now()
    from (
      select sel.*
      from sel
      join existing ex on ex.sub_id = sel.sub_id
      left join cooldown cd on cd.sub_id = sel.sub_id
      where ex.task_id is null
        and cd.sub_id is null
    ) e
    returning id, recipient_email, token
  )
  select
    (select count(*) from ins)::int,
    (select count(*) from cooldown)::int,
    (select array_agg(sub_id) from cooldown),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'task_id', id,
          'to', recipient_email,
          'token', token,
          'link', ('poll-go.html?t=' || token::text)
        )
      ) filter (where recipient_email is not null),
      '[]'::jsonb
    )
  into v_created, v_blocked, v_blocked_sub_ids, v_mail
  from ins;

  v_kept := greatest(coalesce(array_length(p_sub_ids,1),0) - v_created, 0);

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'cancelled', v_cancelled,
    'kept', v_kept,
    'blocked', v_blocked,
    'blocked_sub_ids', coalesce(v_blocked_sub_ids, array[]::uuid[]),
    'mail', v_mail
  );
end;
$function$;

commit;
