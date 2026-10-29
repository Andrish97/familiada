-- 513: luki znalezione sondami nadużyć (tests/sql/abuse-probes.sql).
-- Zwykły zalogowany, gość albo anonim omijał zasady interfejsu przez
-- bezpośrednie wywołania RPC i zapisy do tabel (PostgREST). Poprawki
-- obejmują tylko ścieżki, których front nie używa, albo dokładają po stronie
-- serwera te same zasady, które front już sprawdza — zgodne wstecz z kodem.
-- Lista sond i decyzje: familijna-server/docs/testy-naduzyc.md.

-- ----------------------------------------------------------------------
-- K1: email_mark_confirmed — anonim (brak wiersza auth.users) nie oznacza adresu jako potwierdzonego

CREATE OR REPLACE FUNCTION public.email_mark_confirmed(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_auth_email text := '';
begin
  if v_email = '' then
    return;
  end if;

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = auth.uid()
  limit 1;

  if v_auth_email is null or v_auth_email = '' or v_auth_email <> v_email then
    return;
  end if;

  insert into public.email_intents (email, intent, status, cooldown_until)
  values (v_email, 'signup', 'confirmed', null)
  on conflict (email) do update set
    status = 'confirmed',
    cooldown_until = null,
    updated_at = now();
end;
$function$;

-- ----------------------------------------------------------------------
-- K2: initiate_email_change_intent — tylko zalogowany i bez przejmowania cudzej intencji

CREATE OR REPLACE FUNCTION public.initiate_email_change_intent(p_new_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR position('@' in coalesce(p_new_email, '')) = 0 THEN
    RETURN;
  END IF;
  -- adres innego konta: GoTrue i tak odmówi zmiany
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(trim(p_new_email)) AND u.id <> auth.uid()) THEN
    RETURN;
  END IF;
  INSERT INTO public.email_intents (email, intent, status, cooldown_until, user_id)
  VALUES (
    lower(p_new_email),
    'guest_migrate',
    'pending',
    now() + interval '24 hours',
    auth.uid()
  )
  ON CONFLICT (email) DO UPDATE SET
    intent        = 'guest_migrate',
    status        = 'pending',
    cooldown_until = now() + interval '24 hours',
    user_id       = auth.uid(),
    updated_at    = now()
  WHERE public.email_intents.user_id IS NULL OR public.email_intents.user_id = auth.uid();
END;
$function$;

-- ----------------------------------------------------------------------
-- K2: email_get_status — „oczekuje” z email_intents tylko, gdy konto naprawdę czeka na zmianę
-- na ten adres (auth.users.email_change); inaczej intencja z zewnątrz blokowała rejestrację

CREATE OR REPLACE FUNCTION public.email_get_status(p_email text)
 RETURNS TABLE(status text, intent text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user record;
  v_intent record;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return query select 'none'::text, 'signup'::text;
    return;
  end if;

  select
    u.id,
    u.email_confirmed_at,
    coalesce(u.raw_user_meta_data->>'familijna_email_change_intent', '') as meta_intent
  into v_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if found then
    if v_user.email_confirmed_at is not null then
      return query select 'confirmed'::text, 'signup'::text;
    else
      return query
      select
        'pending'::text,
        case when lower(v_user.meta_intent) = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
    end if;
    return;
  end if;

  select
    ei.status,
    ei.intent,
    ei.cooldown_until,
    ei.user_id
  into v_intent
  from public.email_intents ei
  where ei.email = v_email
  limit 1;

  if found then
    if v_intent.status = 'confirmed' then
      return query select 'confirmed'::text, 'signup'::text;
      return;
    end if;
    if v_intent.status = 'pending' and exists (
         select 1 from auth.users u
         where lower(u.email_change) = v_email
           and (v_intent.user_id is null or u.id = v_intent.user_id)) then
      return query
      select
        'pending'::text,
        case when v_intent.intent = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
      return;
    end if;
  end if;

  return query select 'none'::text, 'signup'::text;
end;
$function$;

-- ----------------------------------------------------------------------
-- K3: rezerwacja odliczania maila po adresie — reset hasła tylko przez serwer (Worker),
-- z przeglądarki tylko odliczanie zamiany gościa na konto, i tylko dla zalogowanego

CREATE OR REPLACE FUNCTION public.mail_cooldown_email_reserve(p_action_key text, p_email text)
 RETURNS TABLE(ok boolean, next_allowed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_action_key IS DISTINCT FROM 'auth:guest_upgrade_email') THEN
    RAISE EXCEPTION 'mail_cooldown_email_reserve: forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.mail_cooldown_reserve(p_action_key, 'email:' || md5(lower(trim(p_email))));
END;
$function$;

-- ----------------------------------------------------------------------
-- K6: migracja gościa — te same zasady hasła co w interfejsie (auth.js validatePassword)

CREATE OR REPLACE FUNCTION public.guest_stage_migration(p_username text DEFAULT NULL::text, p_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  if p_password is null or char_length(p_password) < 8 or char_length(p_password) > 72
     or p_password !~ '[a-z]' or p_password !~ '[A-Z]' or p_password !~ '[0-9]'
     or p_password !~ '[^A-Za-z0-9]' then
    return jsonb_build_object('ok', false, 'error', 'weak_password');
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
$function$;

-- ----------------------------------------------------------------------
-- K7: gość wygasa po 5 dniach bez wizyty (podręcznik 5.1) — bez przedłużania do 30

CREATE OR REPLACE FUNCTION public.guest_touch(p_ttl_days integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_days int := greatest(1, least(coalesce(p_ttl_days, 5), 5));
  v_count int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.profiles
     set guest_last_active_at = now(),
         guest_expires_at = now() + make_interval(days => v_days)
   where id = v_uid
     and is_guest = true;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  return jsonb_build_object('ok', true, 'ttl_days', v_days);
end;
$function$;

-- ----------------------------------------------------------------------
-- K5: rejestracja — nazwa z części adresu przed „@”, jeśli zgodna z zasadami i wolna;
-- inaczej pusta (front prosi o nazwę: /login/?setup=username), zamiast błędu bazy

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_email text;
    v_username text;
    v_is_guest boolean;
    v_last_active timestamptz;
    v_expires_at timestamptz;
    v_lang text;
begin
  v_email    := new.email;
  v_is_guest := coalesce(new.raw_user_meta_data->>'is_guest','false')='true' OR
    (coalesce(new.is_anonymous,false) AND (new.email_confirmed_at IS NULL OR nullif(trim(new.email),'') IS NULL));

  -- Try to get username from metadata or email
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );

  -- Nazwa niezgodna z zasadami, zastrzeżona albo zajęta: konto bez nazwy
  -- (wcześniej unikalny indeks przerywał rejestrację).
  IF v_username IS NOT NULL AND v_username <> '' AND NOT v_is_guest AND (
       v_username !~ '^[a-zA-Z0-9_.-]{3,20}$'
       OR lower(v_username) LIKE 'guest\_%'
       OR public.reserved_username_reason(v_username) IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(v_username) AND p.id <> new.id)) THEN
    v_username := NULL;
  END IF;

  -- If still missing (common for anonymous guests), generate a guest_XXX name
  IF (v_username IS NULL OR v_username = '') AND v_is_guest THEN
    v_username := 'guest_' || substr(replace(new.id::text, '-', ''), 1, 8);
  END IF;

  IF v_is_guest THEN
    v_last_active := now();
    v_expires_at  := now() + interval '5 days';
  ELSE
    v_last_active := null;
    v_expires_at  := null;
  END IF;

  INSERT INTO public.profiles (id, email, username, is_guest, guest_last_active_at, guest_expires_at)
  VALUES (new.id, v_email, v_username, v_is_guest, v_last_active, v_expires_at)
  ON CONFLICT (id) DO UPDATE
    SET email                = excluded.email,
        username             = coalesce(excluded.username, public.profiles.username),
        is_guest             = excluded.is_guest,
        guest_last_active_at = excluded.guest_last_active_at,
        guest_expires_at     = excluded.guest_expires_at;

  INSERT INTO public.user_flags (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  v_lang := lower(trim(coalesce(new.raw_user_meta_data->>'language', 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  BEGIN
    PERFORM public.seed_demo_for_user(new.id, v_lang);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: demo seed failed for % (lang=%): %',
      new.id, v_lang, sqlerrm;
  END;

  RETURN new;
END;
$function$;

-- ----------------------------------------------------------------------
-- G1: treść zablokowanej gry — także przy przenoszeniu wiersza (sprawdzana gra przed i po zmianie)

CREATE OR REPLACE FUNCTION public.guard_game_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_game_id uuid;
  v_type text;
  v_status text;
begin
  -- tylko zapisy prosto z przeglądarki; SECURITY DEFINER i kaskady -> owner
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'questions' then
    v_ids := case tg_op when 'DELETE' then array[old.game_id]
                        when 'INSERT' then array[new.game_id]
                        else array[old.game_id, new.game_id] end;
  else
    select array_agg(q.game_id) into v_ids
    from public.questions q
    where q.id = any(case tg_op when 'DELETE' then array[old.question_id]
                                when 'INSERT' then array[new.question_id]
                                else array[old.question_id, new.question_id] end);
  end if;

  foreach v_game_id in array coalesce(v_ids, '{}') loop
    select g.type::text, g.status::text into v_type, v_status
    from public.games g where g.id = v_game_id;
    if not found then
      continue;
    end if;
    if v_type = 'market' then
      raise exception 'game_content_locked:market' using errcode = 'P0001';
    end if;
    if v_type in ('poll_text', 'poll_points') and v_status in ('poll_open', 'poll_stopped') then
      raise exception 'game_content_locked:%', v_status using errcode = 'P0001';
    end if;
    if public._game_control_active(v_game_id) then
      raise exception 'game_content_locked:control_active' using errcode = 'P0001';
    end if;
  end loop;

  return coalesce(new, old);
end;
$function$;

-- ----------------------------------------------------------------------
-- R3: pytanie w bazie — najwyżej 6 odpowiedzi, punkty 0–100 (podręcznik 9.7)

CREATE OR REPLACE FUNCTION public.guard_qb_question_text()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  a jsonb;
  v_bad text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.payload is not distinct from old.payload then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.payload->'text' is not distinct from old.payload->'text'
     and new.payload->'answers' is not distinct from old.payload->'answers' then
    return new;
  end if;
  if char_length(coalesce(new.payload->>'text', '')) > 100 then
    raise exception 'content_invalid:questionTooLong' using errcode = 'P0001';
  end if;
  if jsonb_typeof(new.payload->'answers') = 'array' and jsonb_array_length(new.payload->'answers') > 6 then
    raise exception 'content_invalid:tooManyAnswers' using errcode = 'P0001';
  end if;
  if jsonb_typeof(new.payload->'answers') = 'array' then
    for a in select value from jsonb_array_elements(new.payload->'answers') loop
      if char_length(coalesce(a->>'text', '')) > 17 then
        raise exception 'content_invalid:answerTooLong' using errcode = 'P0001';
      end if;
      if a ? 'fixed_points' and jsonb_typeof(a->'fixed_points') <> 'null'
         and (jsonb_typeof(a->'fixed_points') <> 'number'
              or (a->>'fixed_points')::numeric < 0 or (a->>'fixed_points')::numeric > 100) then
        raise exception 'content_invalid:points' using errcode = 'P0001';
      end if;
      v_bad := public.fam_answer_invalid_chars(a->>'text');
      if cardinality(v_bad) > 0 then
        raise exception 'content_invalid:answerChars:%', array_to_string(v_bad, ' ') using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------
-- R5: ocena w Społeczności — tylko zarejestrowane konto (gość nie ocenia, jak w interfejsie)

CREATE OR REPLACE FUNCTION public.market_rate_game(p_market_game_id uuid, p_stars integer)
 RETURNS TABLE(ok boolean, err text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return query select false, 'not_authenticated'; return; end if;
  if not public._account_is_registered(v_uid, (select to_jsonb(u) from auth.users u where u.id = v_uid)) then
    return query select false, 'registered_only'; return;
  end if;
  if p_stars < 1 or p_stars > 5 then return query select false, 'invalid_stars'; return; end if;
  if not exists (select 1 from public.market_games where id = p_market_game_id and status = 'published') then
    return query select false, 'game_not_found'; return;
  end if;
  if exists (select 1 from public.market_games where id = p_market_game_id and author_user_id = v_uid) then
    return query select false, 'cannot_rate_own_game'; return;
  end if;

  insert into public.market_game_ratings (market_game_id, user_id, stars)
  values (p_market_game_id, v_uid, p_stars)
  on conflict (market_game_id, user_id) do update
    set stars = excluded.stars,
        created_at = now();

  return query select true, ''::text;
end;
$function$;

-- ----------------------------------------------------------------------
-- P1: pytania ankiety tylko z właściwym kluczem (NULL nie omija sprawdzenia)

CREATE OR REPLACE FUNCTION public.get_poll_game(p_game_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  g public.games;
  out jsonb;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if p_key is null or g.share_key_poll is distinct from p_key then raise exception 'forbidden'; end if;

  if g.type = 'poll_points' then
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status, 'poll_qr_lang', g.poll_qr_lang),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'answers', coalesce((
              select jsonb_agg(jsonb_build_object('id', a.id, 'ord', a.ord, 'text', a.text) order by a.ord)
              from public.answers a
              where a.question_id = q.id
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
    ) into out;
  else
    -- poll_text: zwracamy same pytania (odpowiedzi są tekstowe i idą do poll_text_entries)
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status, 'poll_qr_lang', g.poll_qr_lang),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', q.id, 'ord', q.ord, 'text', q.text)
          order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
    ) into out;
  end if;

  return out;
end;
$function$;

-- ----------------------------------------------------------------------
-- P3: kod urządzenia — tylko dla własnej gry, znany typ urządzenia, ważny 24 h
-- (odświeżany przy każdym pokazaniu kodu)

CREATE OR REPLACE FUNCTION public.generate_device_connect_code(p_game_id uuid, p_device_type text, p_share_key text, p_game_name text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner    uuid := auth.uid();
  v_code     text;
BEGIN
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated');
  END IF;

  IF p_device_type IS NULL OR p_device_type NOT IN ('display', 'host', 'buzzer', 'poll_qr') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'invalid_device_type');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.games g WHERE g.id = p_game_id AND g.owner_id = v_owner) THEN
    RETURN jsonb_build_object('ok', false, 'err', 'forbidden');
  END IF;

  -- Usuń wygasłe kody (tylko te z ustawionym expires_at)
  DELETE FROM public.device_connect_codes
  WHERE owner_id = v_owner
    AND game_id = p_game_id
    AND device_type = p_device_type
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Wygeneruj nowy kod (użyty tylko jeśli brak istniejącego)
  v_code := gen_connect_code();

  -- Atomowy upsert: wstaw nowy kod lub zaktualizuj share_key przy konflikcie.
  -- RETURNING zwraca istniejący code jeśli był konflikt (code nie jest aktualizowany).
  INSERT INTO public.device_connect_codes
    (code, owner_id, game_id, game_name, device_type, share_key, expires_at)
  VALUES
    (v_code, v_owner, p_game_id, left(p_game_name, 80), p_device_type, p_share_key,
     least(coalesce(p_expires_at, now() + interval '24 hours'), now() + interval '24 hours'))
  ON CONFLICT (owner_id, game_id, device_type) DO UPDATE
    SET share_key = EXCLUDED.share_key,
        expires_at = EXCLUDED.expires_at,
        game_name = COALESCE(EXCLUDED.game_name, device_connect_codes.game_name)
  RETURNING code INTO v_code;

  RETURN jsonb_build_object('ok', true, 'code', v_code);
END;
$function$;

-- ----------------------------------------------------------------------
-- K3: surowa rezerwacja odliczań tylko wewnątrz serwera (funkcje SECURITY
-- DEFINER wołają ją jako właściciel). Z przeglądarki: mail_cooldown_email_reserve.
REVOKE EXECUTE ON FUNCTION public.mail_cooldown_reserve(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cooldown_email_reserve(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mail_cooldown_email_reserve(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_cooldown_email_reserve(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mail_cooldown_reserve(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cooldown_email_reserve(text, text, integer) TO service_role;

-- ----------------------------------------------------------------------
-- K4: adres logowania konta (wyzwalacz działa z prawami użytkownika, który
-- nie czyta auth.users).
CREATE OR REPLACE FUNCTION public._auth_user_email(p_uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT u.email FROM auth.users u WHERE u.id = p_uid AND p_uid = auth.uid();
$function$;
REVOKE EXECUTE ON FUNCTION public._auth_user_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._auth_user_email(uuid) TO authenticated, service_role;

-- K4: profil z przeglądarki — tylko nazwa (zasady jak validateUsername)
-- i e-mail równy adresowi logowania (confirm.js syncProfileEmail). Stan
-- gościa i jego ważność zmienia tylko serwer. Profil zakłada handle_new_user.
CREATE OR REPLACE FUNCTION public.guard_profile_client_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'profile_write_forbidden' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.is_guest is distinct from old.is_guest
     or new.guest_last_active_at is distinct from old.guest_last_active_at
     or new.guest_expires_at is distinct from old.guest_expires_at then
    raise exception 'profile_write_forbidden' using errcode = '42501';
  end if;
  if new.email is distinct from old.email
     and new.email is distinct from public._auth_user_email(new.id) then
    raise exception 'profile_email_mismatch' using errcode = '42501';
  end if;
  if new.username is distinct from old.username and (
       new.username is null or new.username !~ '^[a-zA-Z0-9_.-]{3,20}$'
       or lower(new.username) like 'guest\_%') then
    raise exception 'username_invalid' using errcode = '22023';
  end if;
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS a_guard_profile_client_write ON public.profiles;
CREATE TRIGGER a_guard_profile_client_write BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_client_write();

-- ----------------------------------------------------------------------
-- G2, G3: gra z przeglądarki — nowa tylko jako szkic własnego typu (jak
-- games.js createGame), zmiana tylko nazwy i ustawień (edytor, Ustawienia
-- gry). Typ, stan ankiety, pochodzenie (Społeczność, demo, „Od:”) i klucze
-- zmieniają wyłącznie funkcje serwera. Nazwa „a_…” — przed innymi
-- wyzwalaczami BEFORE, które same uzupełniają te kolumny.
CREATE OR REPLACE FUNCTION public.guard_game_client_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.type not in ('prepared', 'poll_text', 'poll_points') or new.status is distinct from 'draft'
       or new.source_market_id is not null or coalesce(new.is_demo, false)
       or new.received_from_label is not null or new.received_from_identity is not null then
      raise exception 'game_write_forbidden' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.type is distinct from old.type
     or new.status is distinct from old.status or new.source_market_id is distinct from old.source_market_id
     or new.is_demo is distinct from old.is_demo
     or new.received_from_label is distinct from old.received_from_label
     or new.received_from_identity is distinct from old.received_from_identity
     or new.share_key_poll is distinct from old.share_key_poll
     or new.share_key_control is distinct from old.share_key_control
     or new.share_key_display is distinct from old.share_key_display
     or new.share_key_host is distinct from old.share_key_host
     or new.share_key_buzzer is distinct from old.share_key_buzzer
     or new.poll_opened_at is distinct from old.poll_opened_at
     or new.poll_closed_at is distinct from old.poll_closed_at
     or new.poll_ended_key is distinct from old.poll_ended_key
     or new.poll_share_updated_at is distinct from old.poll_share_updated_at
     or new.poll_qr_lang is distinct from old.poll_qr_lang then
    raise exception 'game_write_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS a_guard_game_client_write ON public.games;
CREATE TRIGGER a_guard_game_client_write BEFORE INSERT OR UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.guard_game_client_write();

-- ----------------------------------------------------------------------
-- G4, R1: nazwa logo i bazy najwyżej 80 znaków (jak w interfejsie i games_name_len).
CREATE OR REPLACE FUNCTION public.guard_resource_name_len()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' or new.name is distinct from old.name) and char_length(coalesce(new.name, '')) > 80 then
    raise exception 'name_too_long' using errcode = '22001';
  end if;
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS a_guard_resource_name_len ON public.user_logos;
CREATE TRIGGER a_guard_resource_name_len BEFORE INSERT OR UPDATE OF name ON public.user_logos
  FOR EACH ROW EXECUTE FUNCTION public.guard_resource_name_len();
DROP TRIGGER IF EXISTS a_guard_resource_name_len ON public.question_bases;
CREATE TRIGGER a_guard_resource_name_len BEFORE INSERT OR UPDATE OF name ON public.question_bases
  FOR EACH ROW EXECUTE FUNCTION public.guard_resource_name_len();

-- ----------------------------------------------------------------------
-- R4: kolor tagu — #RGB/#RRGGBB/#RRGGBBAA albo nazwa koloru (dane demo).
-- Tekst trafia do style="--c:…" u wszystkich współdzielących bazę.
CREATE OR REPLACE FUNCTION public.guard_qb_tag_color()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.color is not null and (tg_op = 'INSERT' or new.color is distinct from old.color)
     and new.color !~ '^(#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|[A-Za-z]{3,20})$' then
    raise exception 'content_invalid:tagColor' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS a_guard_qb_tag_color ON public.qb_tags;
CREATE TRIGGER a_guard_qb_tag_color BEFORE INSERT OR UPDATE OF color ON public.qb_tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_qb_tag_color();

-- ----------------------------------------------------------------------
-- R6: tag pytania tylko z tej samej bazy (jak qb_category_tags_insert).
DROP POLICY IF EXISTS qb_question_tags_write ON public.qb_question_tags;
CREATE POLICY qb_question_tags_write ON public.qb_question_tags
  USING (EXISTS (SELECT 1 FROM public.qb_questions q
                 WHERE q.id = qb_question_tags.question_id AND public.base_can_edit(q.base_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.qb_questions q JOIN public.qb_tags t ON t.id = qb_question_tags.tag_id
                      WHERE q.id = qb_question_tags.question_id AND t.base_id = q.base_id
                        AND public.base_can_edit(q.base_id, auth.uid())));

-- ----------------------------------------------------------------------
-- R2: oceny i biblioteka Społeczności tylko przez RPC (market_rate_game,
-- dodanie/usunięcie z biblioteki) — wprost z tabeli autor oceniał własną
-- grę, a zmiana wiersza biblioteki pompowała library_count.
REVOKE INSERT, UPDATE, DELETE ON public.market_game_ratings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_market_library FROM anon, authenticated;

-- ----------------------------------------------------------------------
-- K8: ocena systemu — tylko zarejestrowane konto (interfejs nie pyta
-- gościa), komentarz najwyżej 2000 znaków (pole w oknie ma ten limit).
DROP POLICY IF EXISTS "Users can insert their own rating" ON public.app_ratings;
CREATE POLICY "Users can insert their own rating" ON public.app_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id AND char_length(coalesce(comment, '')) <= 2000
    AND NOT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id = auth.uid()), true));
DROP POLICY IF EXISTS "Users can update their own rating" ON public.app_ratings;
CREATE POLICY "Users can update their own rating" ON public.app_ratings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND char_length(coalesce(comment, '')) <= 2000
    AND NOT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id = auth.uid()), true));

-- ----------------------------------------------------------------------
-- P3: dotychczasowe kody bez ważności wygasają za dobę (nowe są odświeżane
-- przy każdym pokazaniu kodu w Control i w oknie QR ankiety).
UPDATE public.device_connect_codes SET expires_at = now() + interval '24 hours' WHERE expires_at IS NULL;
