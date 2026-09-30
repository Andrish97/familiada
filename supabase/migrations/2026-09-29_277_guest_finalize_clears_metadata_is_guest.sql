-- Bug znaleziony przy audycie login/reset/confirm/account: user_metadata.is_guest
-- (ustawiane raz, przy signInGuest()) nigdy nie było czyszczone po migracji
-- gość→pełne konto — ani w starej ścieżce (convertGuestToRegistered(), usunięta
-- w tym audycie z js/core/auth.js), ani w "naprawionej" migracją 249
-- (guest_finalize_migration()). enrichUser() w js/core/auth.js liczy
-- is_guest jako OR: (profiles.is_guest) LUB (user_metadata.is_guest) — więc
-- każde konto, które kiedyś było gościem, wygląda na gościa NA ZAWSZE po
-- konwersji, mimo że profiles.is_guest poprawnie flipuje na false.
-- Skutek w UI: guest-info-modal.js i guest-migrate-reminder.js nękają
-- pełnoprawnego użytkownika w nieskończoność, rating-system.js blokuje mu
-- oceny na stałe.
--
-- Naprawa: guest_finalize_migration() czyści teraz też
-- raw_user_meta_data.is_guest bezpośrednio w auth.users (funkcja jest już
-- SECURITY DEFINER i tak dotyka tej tabeli dla encrypted_password).
-- guest_convert_account() (stara ścieżka, dziś bez wywołań z JS, ale
-- zostawiona w bazie na wypadek klienta z cache starej wersji strony —
-- patrz analogiczna sytuacja z game_action_state w audycie games) dostaje tę
-- samą poprawkę defensywnie.
--
-- Backfill: konta już zmigrowane (profiles.is_guest=false), którym ten sam
-- bug zostawił auth.users.raw_user_meta_data->>'is_guest' = 'true' na stałe.

CREATE OR REPLACE FUNCTION "public"."guest_finalize_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_pending_username text;
  v_pending_password_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false) into v_is_guest
  from public.profiles where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', true);
  end if;

  select email, email_confirmed_at into v_email, v_email_confirmed_at
  from auth.users where id = v_uid;

  if v_email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed');
  end if;

  select pending_username, pending_password_hash
    into v_pending_username, v_pending_password_hash
  from public.guest_migration_staging
  where user_id = v_uid;

  update public.profiles
  set is_guest = false,
      guest_last_active_at = null,
      guest_expires_at = null,
      email = v_email
  where id = v_uid;

  if v_pending_username is not null then
    -- Wyścig o nazwę (ktoś inny zajął ją między submitem a potwierdzeniem)
    -- to unique_violation na profiles_username_ci_uq — nie ma powodu wywalać
    -- całej finalizacji przez to; zostaw placeholder, istniejący fallback
    -- (login.js, ekran setup=username) i tak to obsłuży.
    begin
      update public.profiles
      set username = v_pending_username
      where id = v_uid
        and not exists (
          select 1 from public.profiles pp
          where lower(pp.username) = v_pending_username and pp.id <> v_uid
        );
    exception when unique_violation then
      null;
    end;
  end if;

  if v_pending_password_hash is not null then
    update auth.users set encrypted_password = v_pending_password_hash where id = v_uid;
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_guest', false)
  where id = v_uid;

  delete from public.guest_migration_staging where user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."guest_convert_account"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_guest', false)
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- Backfill: konta już zmigrowane, które ten sam bug zostawił ze stałą
-- metadanych is_guest=true mimo profiles.is_guest=false.
UPDATE auth.users u
SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_guest', false)
FROM public.profiles p
WHERE p.id = u.id
  AND p.is_guest = false
  AND (u.raw_user_meta_data->>'is_guest') = 'true';
