-- guest_cancel_migration() (246) guardowało się warunkiem "czy
-- auth.users.email_change jest jeszcze niepuste" — ale konto, które RAZ
-- już przeszło przez starą, zepsutą wersję "Anuluj" (sprzed tej migracji;
-- czyściła tylko pending e-mail, nie is_guest), ma email_change JUŻ PUSTE,
-- mimo że profiles.is_guest wciąż jest false. Efekt: 246 odmawiało naprawy
-- dokładnie tym kontom, które najbardziej jej potrzebują — potwierdzone na
-- żywo (ten sam błąd "Podaj hasło" po ponownym kliknięciu "Anuluj").
--
-- Właściwy warunek to nie "czy jest jeszcze token", tylko "czy e-mail
-- NIGDY nie został realnie potwierdzony" (auth.users.email_confirmed_at
-- is null) — to poprawnie łapie zarówno świeżo złożoną migrację (pending
-- token istnieje), jak i już nadpsute przez starą wersję konto (token
-- skasowany, ale email nigdy nie potwierdzony), a jednocześnie wciąż
-- odmawia cofnięcia po realnym potwierdzeniu (email_confirmed_at wtedy
-- niepuste).

CREATE OR REPLACE FUNCTION "public"."guest_cancel_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  v_is_guest boolean;
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

  update public.profiles
  set is_guest = true,
      email = null,
      guest_last_active_at = now(),
      guest_expires_at = now() + interval '5 days'
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;
