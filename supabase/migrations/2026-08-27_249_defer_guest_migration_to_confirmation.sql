-- Dotąd guest_convert_account() (wołane z account.js/auth.js NATYCHMIAST przy
-- submicie formularza migracji) ustawiało profiles.is_guest=false zanim
-- e-mail został w ogóle potwierdzony — konto "migrowało" zanim naprawdę
-- migracja się wydarzyła. Skutki uboczne odkryte na żywo w tej sesji:
--   - usuwanie konta bez klikania "Anuluj" traktowało nie do końca
--     zmigrowane konto jak pełne (żądało hasła),
--   - porzucona/niepotwierdzona migracja trwale zerowała guest_expires_at,
--     więc konto nigdy nie było sprzątane przez zwykły guest TTL sweep —
--     wieczna sierota w bazie.
--
-- Naprawa: przenosimy faktyczne przełączenie is_guest/email/username/hasło
-- z momentu SUBMITU na moment POTWIERDZENIA maila. Do tego czasu username
-- (opcjonalnie zbierany w #migrateSection) i hasło (już NIE wysyłane od razu
-- przez convertGuestToRegisteredEmailOnly — patrz zmiana w auth.js) leżą
-- zahaszowane w osobnej, niedostępnej z klienta tabeli — dopiero
-- guest_finalize_migration() (wołane z confirm.js po realnym potwierdzeniu)
-- je aplikuje.
--
-- UWAGA: login.js celowo NIE jest tu zmieniane — dalej używa
-- convertGuestToRegistered() (pełnej wersji z natychmiastowym hasłem i
-- flip'em) i wylogowuje po submicie, tak jak dotychczas. To osobna,
-- świadomie nienaprawiana w tym kroku ścieżka.

CREATE TABLE IF NOT EXISTS "public"."guest_migration_staging" (
    "user_id" "uuid" NOT NULL PRIMARY KEY REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "pending_username" "text",
    "pending_password_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."guest_migration_staging" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_migration_staging_service_only" ON "public"."guest_migration_staging"
    TO "authenticated" USING (false) WITH CHECK (false);

-- Zapisuje wybraną (opcjonalnie) nazwę użytkownika i hasło DO PÓŹNIEJSZEGO
-- zaaplikowania — nic tu nie dotyka profiles/auth.users poza tą tabelą.
CREATE FUNCTION "public"."guest_stage_migration"("p_username" "text" DEFAULT NULL, "p_password" "text" DEFAULT NULL) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean;
  v_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
  v_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false) into v_is_guest
  from public.profiles where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  if v_username is not null then
    if length(v_username) < 3 or length(v_username) > 20
       or v_username like 'guest\_%' escape '\'
       or v_username !~ '^[a-zA-Z0-9_.-]+$'
    then
      return jsonb_build_object('ok', false, 'error', 'invalid_username');
    end if;
  end if;

  if p_password is not null and p_password <> '' then
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  end if;

  insert into public.guest_migration_staging (user_id, pending_username, pending_password_hash, created_at)
  values (v_uid, v_username, v_hash, now())
  on conflict (user_id) do update
    set pending_username = excluded.pending_username,
        pending_password_hash = excluded.pending_password_hash,
        created_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- Woływane z confirm.js dopiero PO realnym potwierdzeniu nowego e-maila.
-- Idempotentne: jeśli is_guest już false (podwójne wywołanie / stary link
-- kliknięty po fakcie), po prostu zwraca ok bez ponownego dotykania danych.
CREATE FUNCTION "public"."guest_finalize_migration"() RETURNS "jsonb"
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

  delete from public.guest_migration_staging where user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- guest_cancel_migration() ma teraz też posprzątać ewentualny staging
-- (username/hasło czekające na potwierdzenie) — inaczej "Anuluj" zostawiałby
-- je martwe w bazie do następnej próby migracji.
--
-- WAŻNE: strażnik "if is_guest then already_guest" z poprzedniej wersji
-- (246/247) był oparty na starym założeniu, że submit migracji NATYCHMIAST
-- flipuje is_guest na false. Odkąd guest_convert_account() przestało to
-- robić przy submicie (patrz komentarz przy CREATE TABLE
-- guest_migration_staging wyżej), profiles.is_guest jest TRUE przez cały
-- czas oczekiwania na potwierdzenie — ten strażnik odpalałby się zawsze i
-- "Anuluj" nigdy by nie zadziałało. Jedyny sensowny warunek blokujący teraz
-- to "e-mail już realnie potwierdzony" (email_confirmed_at) — to samo w
-- sobie wystarcza, bo klient i tak woła tę funkcję tylko gdy wykryje pending
-- stan (patrz refreshMigrateState()/migratePendingEmail w account.js).
CREATE OR REPLACE FUNCTION "public"."guest_cancel_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  has_col boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select email_confirmed_at into v_email_confirmed_at
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

  return jsonb_build_object('ok', true);
end;
$$;
