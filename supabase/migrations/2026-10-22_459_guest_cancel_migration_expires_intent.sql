-- Anulowanie zamiany konta gościa oznacza adres w email_intents jako 'expired',
-- jak cancel_my_email_change -- strona potwierdzenia pokazuje wtedy
-- „Zmiana adresu e-mail została anulowana” zamiast ogólnego błędu.
CREATE OR REPLACE FUNCTION "public"."guest_cancel_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  v_new_email text;
  has_col boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select email_confirmed_at, email_change into v_email_confirmed_at, v_new_email
  from auth.users
  where id = v_uid;

  if v_email_confirmed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;

  perform public.auth_clear_email_change(v_uid);

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password'
  ) into has_col;
  if has_col then
    update auth.users set encrypted_password = null where id = v_uid;
  end if;

  delete from public.guest_migration_staging where user_id = v_uid;

  update public.profiles
  set is_guest = true,
      email = null,
      guest_last_active_at = now(),
      guest_expires_at = now() + interval '5 days'
  where id = v_uid;

  if coalesce(v_new_email, '') <> '' then
    insert into public.email_intents (email, intent, status, user_id)
    values (lower(v_new_email), 'guest_migrate', 'expired', v_uid)
    on conflict (email) do update
      set status = 'expired', updated_at = now()
      where public.email_intents.user_id is not distinct from v_uid;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
