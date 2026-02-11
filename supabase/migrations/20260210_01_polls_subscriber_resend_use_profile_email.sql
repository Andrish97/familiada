-- 2026-02-10: Fix polls_hub_subscriber_resend for username/user_id based subscribers
-- Some subscriptions may be stored with subscriber_user_id (and subscriber_email NULL).
-- Resend must still work by using profiles.email.

begin;

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

  if v_sub.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'only pending can be resent');
  end if;

  -- cooldown: once per 24h
  if v_sub.email_sent_at is not null then
    v_until := v_sub.email_sent_at + interval '24 hours';
    if now() < v_until then
      return jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    end if;
  end if;

  -- resolve recipient email
  if v_sub.subscriber_email is not null then
    v_to := lower(v_sub.subscriber_email);
  elsif v_sub.subscriber_user_id is not null then
    select lower(p.email) into v_to
    from public.profiles p
    where p.id = v_sub.subscriber_user_id
    limit 1;
  end if;

  if public._norm_email(v_to) is null then
    return jsonb_build_object('ok', false, 'error', 'no email for this subscriber');
  end if;

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

commit;
