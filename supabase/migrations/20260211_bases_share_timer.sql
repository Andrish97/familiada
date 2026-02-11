create or replace function public.base_share_cooldown_until(p_base_id uuid, p_recipient_user_id uuid)
returns timestamptz
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_last timestamptz;
begin
  select owner_id into v_owner
  from public.question_bases
  where id = p_base_id;

  if v_owner is null or v_owner <> auth.uid() then
    return null;
  end if;

  select greatest(
    max(t.declined_at),
    max(t.cancelled_at)
  ) into v_last
  from public.base_share_tasks t
  where t.owner_id = v_owner
    and t.base_id = p_base_id
    and t.recipient_user_id = p_recipient_user_id
    and t.status in ('declined','cancelled');

  if v_last is null then
    return null;
  end if;

  return v_last + interval '24 hours';
end;
$$;
