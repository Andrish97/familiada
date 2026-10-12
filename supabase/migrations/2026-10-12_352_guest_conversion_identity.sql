-- E19 pkt7: legacy guest conversion must prove ownership in Auth.
BEGIN;
CREATE OR REPLACE FUNCTION public.guest_convert_account(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_is_guest boolean := false;
  v_auth_email text;
  v_confirmed_at timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  -- Auth is the parent identity; lock it before touching profiles/tasks.
  select lower(trim(email)), email_confirmed_at
    into v_auth_email, v_confirmed_at
  from auth.users where id = v_uid for update;

  if v_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed');
  end if;
  if v_auth_email is distinct from v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
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

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_guest', false)
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$function$;
COMMIT;
