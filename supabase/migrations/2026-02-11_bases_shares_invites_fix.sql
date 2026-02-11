drop function if exists public.list_base_share_tasks_outgoing(uuid);

create or replace function public.list_base_share_tasks_outgoing(p_base_id uuid)
returns table (
  task_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  recipient_username text,
  role public.base_share_role,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_owner uuid;
begin
  perform public.base_share_tasks_cleanup();

  select qb.owner_id
    into v_owner
  from public.question_bases qb
  where qb.id = p_base_id;

  if v_owner is null or v_owner <> auth.uid() then
    return;
  end if;

  return query
  select
    t.id as task_id,
    t.recipient_user_id,
    t.recipient_email,
    pr.username as recipient_username,
    t.role,
    t.status,
    t.created_at
  from public.base_share_tasks t
  left join public.profiles pr on pr.id = t.recipient_user_id
  where t.base_id = p_base_id
    and t.owner_id = auth.uid()
    and t.status in ('pending','opened')
  order by t.created_at desc;
end;
$$;
