-- Migration 316: docelowy model blokad (docs/blokady-zasobow.md, sekcja 6).
-- Tylko do przodu. Zmiany względem poprzednich ciał funkcji oznaczone "-- 316:".
--  * edit_locks: kolumna mode ('exclusive' | 'shared'); klucz (typ, id, karta);
--    wyłączne dalej jeden wiersz na zasób (indeks częściowy), współdzielone
--    mogą trzymać naprawdę wiele kart naraz.
--  * zasób 'logos' (id = użytkownik): cała pula logo; 'base' trzymane też
--    współdzielenie (eksplorator).
--  * jedna reguła zgodności (edit_lock_blockers): wyłączne X przeszkadza każdemu
--    innemu trzymaniu X; współdzielone X nie przeszkadza współdzielonemu X;
--    logos <-> logo:L (logo tego użytkownika) wykluczają się; base:B nie
--    wpływa na elementy bazy (base_question / base_folder / base_tag).
--  * TTL blokady 120 s (edit_lock_ttl()); heartbeat klienta nadal 8 s.
--  * druga warstwa: update_logo_checked, delete_resource_checked,
--    rename_resource_checked (gra, baza, logo) stosują tę samą regułę;
--    parametr p_tab_id wyłącza z kontroli blokady własnej karty.
--    market_remove_from_library idzie przez delete_resource_checked (312).
--  * reguły nie opierają się już na holder_context (kolumna zostaje: statystyki
--    aktywności, komunikat o powodzie zajęcia puli logo).
BEGIN;

-- ---------------------------------------------------------------- tabela

ALTER TABLE "public"."edit_locks"
  ADD COLUMN IF NOT EXISTS "mode" "text" NOT NULL DEFAULT 'exclusive';  -- 316:

ALTER TABLE "public"."edit_locks"
  DROP CONSTRAINT IF EXISTS "edit_locks_mode_check";
ALTER TABLE "public"."edit_locks"
  ADD CONSTRAINT "edit_locks_mode_check" CHECK ("mode" IN ('exclusive', 'shared'));

ALTER TABLE "public"."edit_locks" DROP CONSTRAINT IF EXISTS "edit_locks_pkey";
ALTER TABLE "public"."edit_locks"
  ADD CONSTRAINT "edit_locks_pkey" PRIMARY KEY ("resource_type", "resource_id", "holder_tab_id");

CREATE UNIQUE INDEX IF NOT EXISTS "edit_locks_exclusive_uidx"
  ON "public"."edit_locks" ("resource_type", "resource_id") WHERE "mode" = 'exclusive';

-- ---------------------------------------------------------------- pomocnicze

CREATE OR REPLACE FUNCTION "public"."edit_lock_ttl"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    AS $$ select interval '120 seconds' $$;  -- 316: było 25 s

-- Aktywne trzymania innych kart, które przeszkadzają w zajęciu zasobu
-- (p_type, p_id) w trybie p_mode. p_tab = karta wołająca (jej własne wiersze
-- nie przeszkadzają); NULL = wywołanie bez karty (starsza wersja strony
-- otwarta w chwili wdrożenia) — wtedy nie przeszkadzają trzymania tego samego
-- użytkownika, jak przed 316 (inaczej edytor blokowałby sam siebie).
CREATE OR REPLACE FUNCTION "public"."edit_lock_blockers"("p_type" "text", "p_id" "uuid", "p_mode" "text", "p_tab" "text")
    RETURNS SETOF "public"."edit_locks"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select l.*
  from public.edit_locks l
  where l.heartbeat_at > now() - public.edit_lock_ttl()
    and (case when p_tab is null then l.holder_user_id is distinct from auth.uid()
              else l.holder_tab_id <> p_tab end)
    and (
      -- ten sam zasób: przeszkadza, gdy którakolwiek strona trzyma wyłącznie
      (l.resource_type = p_type and l.resource_id = p_id
        and (l.mode = 'exclusive' or p_mode = 'exclusive'))
      -- logo:L <-> logos tego samego użytkownika
      or (p_type = 'logo' and l.resource_type = 'logos'
        and l.resource_id = (select ul.user_id from public.user_logos ul where ul.id = p_id))
      or (p_type = 'logos' and l.resource_type = 'logo'
        and exists (select 1 from public.user_logos ul
                    where ul.id = l.resource_id and ul.user_id = p_id))
    );
$$;

REVOKE ALL ON FUNCTION "public"."edit_lock_blockers"("text", "uuid", "text", "text") FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION "public"."can_edit_locked_resource"("p_resource_type" "text", "p_resource_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE p_resource_type
    WHEN 'game' THEN EXISTS (
      SELECT 1 FROM public.games WHERE id = p_resource_id AND owner_id = auth.uid()
    )
    WHEN 'logo' THEN EXISTS (
      SELECT 1 FROM public.user_logos WHERE id = p_resource_id AND user_id = auth.uid()
    )
    WHEN 'logos' THEN p_resource_id = auth.uid()  -- 316: pula logo użytkownika
    WHEN 'base' THEN public.base_can_edit(p_resource_id, auth.uid())
    WHEN 'base_question' THEN EXISTS (
      SELECT 1 FROM public.qb_questions q
      WHERE q.id = p_resource_id AND public.base_can_edit(q.base_id, auth.uid())
    )
    WHEN 'base_folder' THEN EXISTS (
      SELECT 1 FROM public.qb_categories c
      WHERE c.id = p_resource_id AND public.base_can_edit(c.base_id, auth.uid())
    )
    WHEN 'base_tag' THEN EXISTS (
      SELECT 1 FROM public.qb_tags t
      WHERE t.id = p_resource_id AND public.base_can_edit(t.base_id, auth.uid())
    )
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------- acquire

CREATE OR REPLACE FUNCTION "public"."acquire_edit_lock_mode"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text", "p_context" "text" DEFAULT NULL::"text", "p_mode" "text" DEFAULT 'exclusive'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
  v_key text;
  v_owner uuid;
  v_row public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(trim(p_tab_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_tab_id');
  end if;
  if p_mode not in ('exclusive', 'shared') then  -- 316:
    return jsonb_build_object('ok', false, 'error', 'unknown_mode');
  end if;
  if p_resource_type not in ('game', 'logo', 'logos', 'base', 'base_question', 'base_folder', 'base_tag') then  -- 316: + logos
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
  v_exists := case p_resource_type
    when 'game' then exists (select 1 from public.games where id = p_resource_id)
    when 'logo' then exists (select 1 from public.user_logos where id = p_resource_id)
    when 'logos' then p_resource_id = v_uid  -- 316: id = użytkownik
    when 'base' then exists (select 1 from public.question_bases where id = p_resource_id)
    when 'base_question' then exists (select 1 from public.qb_questions where id = p_resource_id)
    when 'base_folder' then exists (select 1 from public.qb_categories where id = p_resource_id)
    when 'base_tag' then exists (select 1 from public.qb_tags where id = p_resource_id)
    else false
  end;
  if not v_exists then
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if not public.can_edit_locked_resource(p_resource_type, p_resource_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- 316: serializacja zajmowania w obrębie zasobu; logo i pula logo użytkownika
  -- dzielą jeden klucz, bo zasady zgodności łączą je ze sobą.
  if p_resource_type = 'logo' then
    select user_id into v_owner from public.user_logos where id = p_resource_id;
    v_key := 'logos:' || v_owner::text;
  elsif p_resource_type = 'logos' then
    v_key := 'logos:' || p_resource_id::text;
  else
    v_key := p_resource_type || ':' || p_resource_id::text;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  -- 316: wygasłe trzymania innych kart tego zasobu znikają (zwalniają klucz
  -- wyłączny); wygasłe nie przeszkadzają też w edit_lock_blockers.
  delete from public.edit_locks
   where resource_type = p_resource_type
     and resource_id = p_resource_id
     and holder_tab_id <> p_tab_id
     and heartbeat_at < now() - public.edit_lock_ttl();

  select * into v_row
  from public.edit_lock_blockers(p_resource_type, p_resource_id, p_mode, p_tab_id)
  order by acquired_at
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'holder_user_id', v_row.holder_user_id, 'acquired_at', v_row.acquired_at,
      'blocker_type', v_row.resource_type, 'blocker_mode', v_row.mode,
      'blocker_context', v_row.holder_context);
  end if;

  insert into public.edit_locks
    (resource_type, resource_id, holder_tab_id, holder_user_id, holder_context, mode, acquired_at, heartbeat_at)
  values
    (p_resource_type, p_resource_id, p_tab_id, v_uid, p_context, p_mode, now(), now())
  on conflict (resource_type, resource_id, holder_tab_id) do update
    set holder_user_id = excluded.holder_user_id,
        holder_context = excluded.holder_context,
        heartbeat_at = excluded.heartbeat_at,
        acquired_at = case
          when public.edit_locks.mode = excluded.mode
            then public.edit_locks.acquired_at
          else excluded.acquired_at
        end,
        mode = excluded.mode;

  return jsonb_build_object('ok', true, 'acquired', true);
end;
$$;

-- Stara sygnatura (4 argumenty) działa dalej jako trzymanie wyłączne.
CREATE OR REPLACE FUNCTION "public"."acquire_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text", "p_context" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.acquire_edit_lock_mode(p_resource_type, p_resource_id, p_tab_id, p_context, 'exclusive');
$$;

-- ---------------------------------------------------------------- druga warstwa

DROP FUNCTION IF EXISTS "public"."update_logo_checked"("uuid", "jsonb");

CREATE OR REPLACE FUNCTION "public"."update_logo_checked"("p_logo_id" "uuid", "p_patch" "jsonb", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (select 1 from public.user_logos where id = p_logo_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  -- 316: to logo (inna karta) albo cała pula logo (Control / ustawienia gry)
  -- trzymane przez kogoś innego.
  select * into v_blocker
  from public.edit_lock_blockers('logo', p_logo_id, 'exclusive', p_tab_id)
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked',
      'blocker_type', v_blocker.resource_type, 'blocker_context', v_blocker.holder_context);
  end if;

  update public.user_logos
  set
    name = coalesce(p_patch->>'name', name),
    type = coalesce(p_patch->>'type', type),
    payload = coalesce(p_patch->'payload', payload)
  where id = p_logo_id and user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

DROP FUNCTION IF EXISTS "public"."delete_resource_checked"("text", "uuid");

CREATE OR REPLACE FUNCTION "public"."delete_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 312: otwarta ankieta nie blokuje usunięcia (zostaje przerwana: głosy, sesje
    -- i zaproszenia znikają kaskadą). Blokuje tylko zajęta blokada gry.

    -- 316: game:G trzymane przez inną kartę (wyłączne albo współdzielone)
    select * into v_blocker
    from public.edit_lock_blockers('game', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- 312: maile w kolejce z zaproszeniami do ankiety tej gry (link
    -- poll-go?t=<token> w treści; mail_queue nie ma kolumny z identyfikatorem gry).
    delete from public.mail_queue q
    using public.poll_tasks pt
    where pt.game_id = p_resource_id
      and position(('poll-go?t=' || pt.token::text) in q.html) > 0;

    -- 312: zapamiętane urządzenia tej gry (FK dałby tylko SET NULL).
    delete from public.shared_devices where game_id = p_resource_id;

    delete from public.games where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'logo' then
    if not exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 316: logo:L w innej karcie albo pula logo (logos) trzymana przez kogoś
    -- innego -- jedna reguła zgodności zamiast kontekstów settings / control.
    select * into v_blocker
    from public.edit_lock_blockers('logo', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked',
        'blocker_type', v_blocker.resource_type, 'blocker_context', v_blocker.holder_context);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 316: base:B trzymane (współdzielone -- eksplorator, albo wyłączne) przez
    -- kogoś innego.
    select * into v_blocker
    from public.edit_lock_blockers('base', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- Którykolwiek element WEWNĄTRZ tej bazy (pytanie/folder/tag) ma teraz
    -- aktywną sesję edycji (Warstwa 1, migracja 257) -- usunięcie całej
    -- bazy skasowałoby go (CASCADE) spod ręki edytującego bez ostrzeżenia.
    if exists (
      select 1 from public.edit_locks l
      where l.heartbeat_at > now() - public.edit_lock_ttl()  -- 316: TTL
        and l.holder_tab_id is distinct from p_tab_id
        and (
          (l.resource_type = 'base_question' and exists (
            select 1 from public.qb_questions q where q.id = l.resource_id and q.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_folder' and exists (
            select 1 from public.qb_categories c where c.id = l.resource_id and c.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_tag' and exists (
            select 1 from public.qb_tags t where t.id = l.resource_id and t.base_id = p_resource_id
          ))
        )
    ) then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    delete from public.question_bases where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;

-- 316: zmiana nazwy gry / bazy / logo po stronie bazy (wcześniej gra i baza:
-- zwykły update bez kontroli blokad).
CREATE OR REPLACE FUNCTION "public"."rename_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid", "p_name" "text", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;
    select * into v_blocker from public.edit_lock_blockers('game', p_resource_id, 'exclusive', p_tab_id) limit 1;
    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;
    update public.games set name = v_name where id = p_resource_id and owner_id = v_uid;

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;
    select * into v_blocker from public.edit_lock_blockers('base', p_resource_id, 'exclusive', p_tab_id) limit 1;
    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;
    update public.question_bases set name = v_name, updated_at = now()
     where id = p_resource_id and owner_id = v_uid;

  elsif p_resource_type = 'logo' then
    return public.update_logo_checked(p_resource_id, jsonb_build_object('name', v_name), p_tab_id);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- TTL w odczycie Hosta

CREATE OR REPLACE FUNCTION public.host2_logo_get_public(p_game_id uuid, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g public.games;
  logo_id uuid;
  logo jsonb;
  busy boolean;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = p_game_id;
  IF NOT FOUND OR p_key IS NULL OR p_key = '' OR g.share_key_host IS DISTINCT FROM p_key THEN RETURN NULL; END IF;
  logo_id := nullif(g.settings->'display'->>'logoId', '')::uuid;
  IF logo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_logos l WHERE l.id = logo_id AND l.user_id = g.owner_id) THEN logo_id := NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM public.edit_locks l WHERE l.resource_type = 'logo' AND l.resource_id = logo_id
    AND l.heartbeat_at > now() - public.edit_lock_ttl()) INTO busy;  -- 316: TTL
  IF NOT busy AND logo_id IS NOT NULL THEN
    SELECT jsonb_build_object('type', l.type, 'payload', l.payload, 'name', l.name) INTO logo
    FROM public.user_logos l WHERE l.id = logo_id AND l.user_id = g.owner_id;
  END IF;
  RETURN jsonb_build_object('busy', busy, 'logo', logo, 'logoId', logo_id);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
