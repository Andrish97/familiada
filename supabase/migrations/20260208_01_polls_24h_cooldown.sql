-- 2026-02-08: 24h anti-spam cooldown for poll subscription resend + poll task re-invite
-- Apply in Supabase SQL editor / migrations.

begin;

-- 1) Ensure poll_tasks has consistent *_at timestamps when status changes (used for cooldown logic).
create or replace function public.poll_tasks_touch_status_ts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'opened' and new.opened_at is null then
      new.opened_at := now();
    end if;

    if new.status = 'done' and new.done_at is null then
      new.done_at := now();
    end if;

    if new.status = 'declined' and new.declined_at is null then
      new.declined_at := now();
    end if;

    if new.status = 'cancelled' and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_poll_tasks_touch_status_ts on public.poll_tasks;
create trigger trg_poll_tasks_touch_status_ts
before update of status on public.poll_tasks
for each row
execute function public.poll_tasks_touch_status_ts();

-- 2) Subscriber resend: allow only once per 24h (based on email_sent_at).
create or replace function public.polls_hub_subscriber_resend(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.poll_subscriptions%rowtype;
  v_to text;
  v_link text;
  v_until timestamptz;
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

  if v_sub.subscriber_email is null then
    return jsonb_build_object('ok', false, 'error', 'no email for this subscriber');
  end if;

  if v_sub.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'only pending can be resent');
  end if;

  if v_sub.email_sent_at is not null then
    v_until := v_sub.email_sent_at + interval '24 hours';
    if now() < v_until then
      return jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    end if;
  end if;

  v_to := lower(v_sub.subscriber_email);
  v_link := ('poll_go.html?s=' || v_sub.token::text)::text;

  update public.poll_subscriptions
  set email_sent_at = now(),
      email_send_count = email_send_count + 1
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'to', v_to,
    'kind', 'sub_invite',
    'link', v_link,
    'token', v_sub.token
  );
end;
$$;

-- 3) Share poll: prevent re-inviting the same recipient within 24h after cancelled/declined.
create or replace function public.polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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

  -- tylko właściciel gry
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

  -- 1) anuluj aktywne zadania dla osób, których nie ma już w wyborze
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

  -- 2) utwórz brakujące zadania dla wybranych subów (z cooldownem 24h po cancelled/declined)
  with sel as (
    select
      s.id as sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) as subscriber_email
    from public.poll_subscriptions s
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
      e.subscriber_email,
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
          'link', ('poll_go.html?t=' || token::text)
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
$$;

commit;
