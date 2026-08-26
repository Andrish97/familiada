-- guest_convert_account() (wywoływane przy submit migracji gościa na
-- /account i /login) od razu, nieodwracalnie ustawia profiles.is_guest =
-- false i czyści guest_expires_at — jeszcze ZANIM e-mail zostanie
-- potwierdzony. cancel_my_email_change() czyści tylko pending e-mail w
-- auth.users, więc konto zostawało w martwym stanie: ani gość (stracił
-- swój 5-dniowy safety-net na auto-czyszczenie), ani pełne konto (bez
-- potwierdzonego e-maila, bez sensownego loginu).
--
-- Ta funkcja robi realny "cancel": czyści pending e-mail change (jak
-- cancel_my_email_change) I przywraca is_guest/guest_expires_at/email do
-- stanu sprzed migracji — ale tylko jeśli migracja faktycznie jeszcze
-- trwa (auth.users.email_change niepuste). Jeśli e-mail już potwierdzony,
-- cofanie nie ma sensu i funkcja odmawia.

CREATE FUNCTION "public"."guest_cancel_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_pending_email text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select email_change into v_pending_email
  from auth.users
  where id = v_uid;

  if v_pending_email is null or v_pending_email = '' then
    return jsonb_build_object('ok', false, 'error', 'no_pending_migration');
  end if;

  perform public.auth_clear_email_change(v_uid);

  update public.email_intents
  set status = 'expired', updated_at = now()
  where email = lower(v_pending_email);

  update public.profiles
  set is_guest = true,
      email = null,
      guest_last_active_at = now(),
      guest_expires_at = now() + interval '5 days'
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;
