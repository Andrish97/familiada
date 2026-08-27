-- guest_cancel_migration() (246/247) przywracało is_guest/guest_expires_at/
-- email, ale nigdy nie czyściło hasła ustawionego przy submicie migracji
-- (convertGuestToRegistered() ustawia je NATYCHMIAST, bez czekania na
-- potwierdzenie maila — Supabase nie wymaga potwierdzenia dla samego hasła).
-- Po "Anuluj" konto wraca do bycia gościem, ale technicznie miałoby wciąż
-- ważne hasło z próby migracji — niespójne ze zwykłym gościem (który nigdy
-- hasła nie ma, loguje się przez signInAnonymously). Czyścimy
-- auth.users.encrypted_password tak samo defensywnie jak
-- auth_clear_email_change czyści tokeny zmiany e-maila (sprawdzenie
-- istnienia kolumny), na wypadek różnic między wersjami GoTrue.

CREATE OR REPLACE FUNCTION "public"."guest_cancel_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  v_is_guest boolean;
  has_col boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false) into v_is_guest
  from public.profiles
  where id = v_uid;

  if v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'already_guest');
  end if;

  select email_confirmed_at into v_email_confirmed_at
  from auth.users
  where id = v_uid;

  if v_email_confirmed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;

  -- Bezpieczne no-op jeśli pending token już wcześniej wyczyszczony.
  perform public.auth_clear_email_change(v_uid);

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password'
  ) into has_col;
  if has_col then
    update auth.users set encrypted_password = null where id = v_uid;
  end if;

  update public.profiles
  set is_guest = true,
      email = null,
      guest_last_active_at = now(),
      guest_expires_at = now() + interval '5 days'
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;
