-- 20260215_02_polls_tasks_subs_cooldowns_and_mail
-- Fixes:
-- 1) poll_tasks decline should set status='declined' (details view correctness)
-- 2) polls_hub_share_poll should include email also for registered recipients (profiles.email)
-- 3) closing readiness should require X=Y (no active tasks pending/opened)
-- 4) subscription invites: block re-invite for 5 days after cancelled/declined
-- 5) declined subscriptions visible for 5 days (is_expired uses action timestamps)

-- ---------------------------------------------------------
-- 1) Decline task => set status
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polls_hub_task_decline(p_task_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.poll_tasks t
     set declined_at = now(),
         status = 'declined'
   where t.id = p_task_id
     and t.recipient_user_id = auth.uid()
     and t.done_at is null
     and t.declined_at is null
     and t.cancelled_at is null;

  return found;
end;
$function$;


-- ---------------------------------------------------------
-- 2) Share poll: ensure recipient_email for registered users
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      e.resolved_email,
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
$function$;


-- ---------------------------------------------------------
-- 3) Close readiness must require no active tasks (X=Y)
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polls_hub_can_close(p_game_id uuid, p_poll_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Nie zamykamy jeśli są jeszcze aktywne taski (niezagłosowane): X != Y
  IF EXISTS (
    SELECT 1
    FROM public.poll_tasks t
    WHERE t.owner_id = auth.uid()
      AND t.game_id = p_game_id
      AND t.done_at IS NULL
      AND t.declined_at IS NULL
      AND t.cancelled_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN CASE
    WHEN p_poll_type = 'poll_points' THEN public.polls_hub_can_close_poll_points(p_game_id)
    WHEN p_poll_type = 'poll_text'   THEN public.polls_hub_can_close_poll_text(p_game_id)
    ELSE FALSE
  END;
END;
$function$;


-- ---------------------------------------------------------
-- 4) Subscription invite cooldown (5 days after declined/cancelled)
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite(p_recipient text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rec text := lower(trim(coalesce(p_recipient,'')));
  v_user_id uuid;
  v_email text;
  v_token uuid;
  v_id uuid;
  v_last public.poll_subscriptions%rowtype;
  v_until timestamptz;
  v_block_ts timestamptz;
begin
  if v_rec = '' then
    return jsonb_build_object('ok', false, 'error', 'empty recipient');
  end if;

  -- 1) spróbuj po username
  select id, email into v_user_id, v_email
  from public.profiles
  where lower(username) = v_rec
  limit 1;

  -- 2) jeśli nie znaleziono po username, spróbuj po email
  if v_user_id is null then
    select id, email into v_user_id, v_email
    from public.profiles
    where lower(email) = v_rec
    limit 1;
  end if;

  -- docelowy email do rekordu (z profilu albo wpisany)
  if v_email is null then
    v_email := v_rec;
  end if;

  -- jeśli już istnieje pending/active do tego odbiorcy (po user_id lub email), nie twórz duplikatu
  select ps.id, ps.token into v_id, v_token
  from public.poll_subscriptions ps
  where ps.owner_id = auth.uid()
    and (
      (v_user_id is not null and ps.subscriber_user_id = v_user_id)
      or (ps.subscriber_email is not null and lower(ps.subscriber_email) = v_email)
    )
    and ps.status in ('pending','active')
  limit 1;

  if v_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_id,
      'token', v_token,
      'channel', case when v_user_id is not null then 'onsite' else 'email' end
    );
  end if;

  -- cooldown 5 dni po cancelled/declined (także dla email-only)
  select * into v_last
  from public.poll_subscriptions ps
  where ps.owner_id = auth.uid()
    and (
      (v_user_id is not null and ps.subscriber_user_id = v_user_id)
      or (ps.subscriber_email is not null and lower(ps.subscriber_email) = v_email)
    )
    and ps.status in ('cancelled','declined')
  order by coalesce(ps.cancelled_at, ps.declined_at, ps.updated_at, ps.created_at) desc
  limit 1;

  if v_last.id is not null then
    v_block_ts := coalesce(v_last.cancelled_at, v_last.declined_at, v_last.updated_at, v_last.created_at);
    v_until := v_block_ts + interval '5 days';
    if now() < v_until then
      return jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    end if;
  end if;

  -- wstaw invite/subscription
  insert into public.poll_subscriptions (
    owner_id,
    subscriber_user_id,
    subscriber_email,
    status
  )
  values (
    auth.uid(),
    v_user_id,
    case when v_user_id is null then v_email else null end,
    'pending'
  )
  returning id, token into v_id, v_token;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'id', v_id,
    'token', v_token,
    'channel', case when v_user_id is not null then 'onsite' else 'email' end,
    'email', case when v_user_id is null then v_email else null end
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite_a(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_h text := trim(coalesce(p_handle,''));
  v_is_email boolean := position('@' in v_h) > 1;
  v_profile public.profiles%rowtype;
  v_existing public.poll_subscriptions%rowtype;
  v_sub_id uuid;
  v_token uuid;
  v_to text;
  v_go text;
  v_until timestamptz;
  v_block_ts timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  if v_h = '' then
    return jsonb_build_object('ok', false, 'error', 'empty handle');
  end if;

  -- resolve by username/email to profile (registered user)
  select * into v_profile
  from public.profiles p
  where lower(p.username) = lower(v_h)
     or lower(p.email) = lower(v_h)
  limit 1;

  -- find existing subscription row (avoid duplicates)
  if found then
    select * into v_existing
    from public.poll_subscriptions s
    where s.owner_id = v_uid
      and s.subscriber_user_id = v_profile.id
    order by coalesce(s.updated_at, s.created_at) desc
    limit 1;
  else
    if not v_is_email then
      return jsonb_build_object('ok', false, 'error', 'unknown username (not registered)');
    end if;

    select * into v_existing
    from public.poll_subscriptions s
    where s.owner_id = v_uid
      and lower(s.subscriber_email) = lower(v_h)
    order by coalesce(s.updated_at, s.created_at) desc
    limit 1;
  end if;

  if v_existing.id is not null and v_existing.status in ('pending','active') then
    v_token := v_existing.token;
    v_go := ('poll_go.html?s=' || v_token::text)::text;
    v_to := coalesce(v_profile.email, v_existing.subscriber_email);

    return jsonb_build_object(
      'ok', true,
      'already', true,
      'sub_id', v_existing.id,
      'status', v_existing.status,
      'token', v_token,
      'go_url', v_go,
      'to', v_to,
      'registered', (v_profile.id is not null)
    );
  end if;

  -- cooldown 5 dni po cancelled/declined
  if v_existing.id is not null and v_existing.status in ('cancelled','declined') then
    v_block_ts := coalesce(v_existing.cancelled_at, v_existing.declined_at, v_existing.updated_at, v_existing.created_at);
    v_until := v_block_ts + interval '5 days';
    if now() < v_until then
      return jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    end if;
  end if;

  -- create new subscription invite
  v_token := gen_random_uuid();

  if v_profile.id is not null then
    insert into public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    values (v_uid, v_profile.id, null, v_token, 'pending', now())
    returning id into v_sub_id;
    v_to := v_profile.email;
  else
    insert into public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    values (v_uid, null, lower(v_h), v_token, 'pending', now())
    returning id into v_sub_id;
    v_to := lower(v_h);
  end if;

  v_go := ('poll_go.html?s=' || v_token::text)::text;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'sub_id', v_sub_id,
    'status', 'pending',
    'token', v_token,
    'go_url', v_go,
    'to', v_to,
    'registered', (v_profile.id is not null)
  );
end;
$function$;


-- ---------------------------------------------------------
-- 5) Lists: declined visible for 5 days (is_expired uses action timestamps)
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polls_hub_list_my_subscribers()
 RETURNS TABLE(sub_id uuid, subscriber_user_id uuid, subscriber_email text, subscriber_label text, status text, created_at timestamp with time zone, token uuid, email_sent_at timestamp with time zone, email_send_count integer, is_expired boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    s.id,
    s.subscriber_user_id,
    s.subscriber_email,
    case
      when s.subscriber_user_id is not null then coalesce(p.username, p.email, '—')
      else coalesce(s.subscriber_email, '—')
    end as subscriber_label,
    s.status,
    s.created_at,
    s.token,
    s.email_sent_at,
    s.email_send_count,
    (
      s.status in ('pending','declined','cancelled')
      and coalesce(s.declined_at, s.cancelled_at, s.email_sent_at, s.updated_at, s.created_at) < now() - interval '5 days'
    ) as is_expired
  from public.poll_subscriptions s
  left join public.profiles p on p.id = s.subscriber_user_id
  where s.owner_id = auth.uid()
  order by s.created_at desc;
end;
$function$;


CREATE OR REPLACE FUNCTION public.polls_hub_list_my_subscriptions()
 RETURNS TABLE(sub_id uuid, owner_id uuid, owner_label text, status text, created_at timestamp with time zone, token uuid, go_url text, is_expired boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.poll_claim_email_records();

  return query
  select
    s.id,
    s.owner_id,
    coalesce(p.username, p.email, '—') as owner_label,
    s.status,
    s.created_at,
    s.token,
    ('poll_go.html?s=' || s.token::text)::text as go_url,
    (
      s.status in ('pending','declined','cancelled')
      and coalesce(s.declined_at, s.cancelled_at, s.updated_at, s.created_at) < now() - interval '5 days'
    ) as is_expired
  from public.poll_subscriptions s
  left join public.profiles p on p.id = s.owner_id
  where s.subscriber_user_id = auth.uid()
  order by s.created_at desc;
end;
$function$;
