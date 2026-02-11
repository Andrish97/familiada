create or replace function public.auth_clear_email_change(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sets text[] := array[]::text[];
  q text;
  has_col boolean;
begin
  -- helper: column exists?
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'new_email'
  ) into has_col;
  if has_col then sets := sets || 'new_email = null'; end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_change_token_current'
  ) into has_col;
  if has_col then sets := sets || 'email_change_token_current = null'; end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_change_token_new'
  ) into has_col;
  if has_col then sets := sets || 'email_change_token_new = null'; end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_change_sent_at'
  ) into has_col;
  if has_col then sets := sets || 'email_change_sent_at = null'; end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_change_confirm_status'
  ) into has_col;
  if has_col then sets := sets || 'email_change_confirm_status = 0'; end if;

  if array_length(sets, 1) is null then
    return false; -- unknown GoTrue layout
  end if;

  q := format('update auth.users set %s where id = $1', array_to_string(sets, ', '));
  execute q using p_user_id;

  return true;
end;
$$;

revoke all on function public.auth_clear_email_change(uuid) from public;
grant execute on function public.auth_clear_email_change(uuid) to service_role;
