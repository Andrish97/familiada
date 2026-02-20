-- Convert current guest account into regular account (keep data, stop TTL cleanup)

create or replace function public.guest_convert_account(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_is_guest boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select coalesce(is_guest, false)
    into v_is_guest
  from public.profiles
  where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  update public.profiles
     set is_guest = false,
         guest_last_active_at = null,
         guest_expires_at = null,
         email = v_email
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.guest_convert_account(text) to authenticated;
