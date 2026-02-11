create or replace function public.base_share_by_user(
  p_base_id uuid,
  p_recipient_user_id uuid,
  p_role public.base_share_role
)
returns table(
  ok boolean,
  err text,
  mail_to text,
  mail_link text,
  base_name text,
  owner_label text
)
language plpgsql
security definer
as $function$
declare
  v_owner uuid;
  v_recipient uuid;
  v_base_name text;
  v_owner_label text;
  v_last_ts timestamptz;
  v_norm_email text;
  v_task public.base_share_tasks%rowtype;
begin
  perform public.base_share_tasks_cleanup();

  v_recipient := p_recipient_user_id;

  select owner_id, name
    into v_owner, v_base_name
  from public.question_bases
  where id = p_base_id;

  if v_owner is null or v_owner <> auth.uid() then
    return query select false, 'not_owner', null, null, null, null;
    return;
  end if;

  if v_recipient is null then
    return query select false, 'unknown_user', null, null, null, null;
    return;
  end if;

  if v_recipient = v_owner then
    return query select false, 'owner', null, null, null, null;
    return;
  end if;

  -- email odbiorcy (opcjonalnie – brak emaila nie blokuje taska)
  select nullif(lower(trim(pr.email)), '')
    into v_norm_email
  from public.profiles pr
  where pr.id = v_recipient;

  -- jeśli już jest share -> update roli (bez invite/task)
  if exists (
    select 1
    from public.question_base_shares s
    where s.base_id = p_base_id and s.user_id = v_recipient
  ) then
    update public.question_base_shares
      set role = p_role
    where base_id = p_base_id and user_id = v_recipient;

    return query select true, null, null, null, v_base_name, null;
    return;
  end if;

  -- cooldown: ostatnie declined/cancelled w 24h
  select greatest(max(t.declined_at), max(t.cancelled_at))
    into v_last_ts
  from public.base_share_tasks t
  where t.owner_id = v_owner
    and t.base_id = p_base_id
    and t.recipient_user_id = v_recipient
    and t.status in ('declined','cancelled');

  if v_last_ts is not null and v_last_ts > now() - interval '24 hours' then
    return query select false, 'cooldown', null, null, null, null;
    return;
  end if;

  -- jeśli już jest pending/opened -> blokuj
  if exists (
    select 1
    from public.base_share_tasks t
    where t.owner_id = v_owner
      and t.base_id = p_base_id
      and t.recipient_user_id = v_recipient
      and t.status in ('pending','opened')
  ) then
    return query select false, 'already_pending', null, null, null, null;
    return;
  end if;

  select coalesce(pr.username, pr.email)
    into v_owner_label
  from public.profiles pr
  where pr.id = v_owner;

  insert into public.base_share_tasks(
    owner_id, base_id, recipient_user_id, recipient_email, role, status
  )
  values (v_owner, p_base_id, v_recipient, v_norm_email, p_role, 'pending')
  returning * into v_task;

  return query
  select
    true,
    null,
    v_norm_email,
    ('/bases.html?share=' || v_task.token::text),
    v_base_name,
    v_owner_label;
end;
$function$;
