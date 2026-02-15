-- Allow recipients to remove an accepted shared base from their list.
-- "Leave" = delete share row for current user.

create or replace function public.leave_shared_base(p_base_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  delete from public.question_base_shares
  where base_id = p_base_id
    and user_id = auth.uid();

  return true;
exception when others then
  return false;
end;
$$;
