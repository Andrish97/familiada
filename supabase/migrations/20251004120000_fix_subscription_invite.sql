create or replace function public.polls_hub_subscription_invite(p_recipient text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rec text := lower(trim(coalesce(p_recipient,'')));
  v_user_id uuid;
  v_email text;
  v_token uuid;
  v_id uuid;
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
