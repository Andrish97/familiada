-- Krok 4 audytu (docs/plan-testy-i-poprawki.md, "Model: zasób ma stan
-- busy/free"): logo-editor.js dostaje Warstwę 1 per-konkretne-logo
-- (acquire_edit_lock('logo', logoId, ...)) ORAZ nową, szerszą regułę:
-- Control (rozgrywka) lub otwarte game-settings.js dla KTÓREJKOLWIEK gry
-- użytkownika blokują edycję/usunięcie/zmianę nazwy WSZYSTKICH jego logo
-- naraz -- bo Control/ustawienia korzystają z całej puli logo użytkownika,
-- nie tylko z jednego referencowanego. Wymaga wiedzieć PRZEZ KTÓRĄ stronę
-- trzymany jest wspólny lock 'game' (dziś scalone bez rozróżnienia) --
-- stąd nowa kolumna holder_context, czysto informacyjna: NIE zmienia
-- mechanizmu wzajemnego wykluczania (ten nadal działa po
-- resource_type+resource_id), tylko dodaje metadane do TEGO dodatkowego
-- sprawdzenia.

ALTER TABLE public.edit_locks ADD COLUMN IF NOT EXISTS holder_context text;

-- Musi być DROP przed CREATE OR REPLACE -- dodanie parametru zmienia
-- sygnaturę funkcji; bez usunięcia starej wersji PostgREST widziałby dwie
-- przeciążone funkcje (3 i 4 argumenty) i wywołania z samymi trzema
-- nazwanymi argumentami stałyby się niejednoznaczne.
DROP FUNCTION IF EXISTS "public"."acquire_edit_lock"("text", "uuid", "text");

CREATE OR REPLACE FUNCTION "public"."acquire_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text", "p_context" "text" DEFAULT NULL) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
  v_can boolean := false;
  v_row public.edit_locks;
  v_got boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if coalesce(trim(p_tab_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_tab_id');
  end if;

  if p_resource_type = 'game' then
    v_exists := exists (select 1 from public.games where id = p_resource_id);
    v_can := exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid);
  elsif p_resource_type = 'logo' then
    v_exists := exists (select 1 from public.user_logos where id = p_resource_id);
    v_can := exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid);
  elsif p_resource_type = 'base' then
    v_exists := exists (select 1 from public.question_bases where id = p_resource_id);
    v_can := v_exists and public.base_can_edit(p_resource_id, v_uid);
  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;

  if not v_exists then
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;

  if not v_can then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.edit_locks (resource_type, resource_id, holder_tab_id, holder_user_id, holder_context, acquired_at, heartbeat_at)
  values (p_resource_type, p_resource_id, p_tab_id, v_uid, p_context, now(), now())
  on conflict (resource_type, resource_id) do update
    set holder_tab_id = excluded.holder_tab_id,
        holder_user_id = excluded.holder_user_id,
        holder_context = excluded.holder_context,
        heartbeat_at = excluded.heartbeat_at,
        acquired_at = case
          when public.edit_locks.holder_tab_id = excluded.holder_tab_id
            then public.edit_locks.acquired_at
          else excluded.acquired_at
        end
    where public.edit_locks.holder_tab_id = excluded.holder_tab_id
       or public.edit_locks.heartbeat_at < now() - interval '25 seconds'
  returning true into v_got;

  if v_got is true then
    return jsonb_build_object('ok', true, 'acquired', true);
  end if;

  select * into v_row
  from public.edit_locks
  where resource_type = p_resource_type and resource_id = p_resource_id;

  return jsonb_build_object(
    'ok', false,
    'error', 'locked',
    'holder_user_id', v_row.holder_user_id,
    'acquired_at', v_row.acquired_at
  );
end;
$$;

-- delete_resource_checked('logo', ...): zamiast wąskiego sprawdzenia
-- "czy TA KONKRETNA gra referencująca to logo ma teraz otwarte ustawienia"
-- -- szersza reguła: czy właściciel logo ma TERAZ aktywny lock 'game'
-- trzymany przez game-settings.js lub Control (holder_context), dla
-- KTÓREJKOLWIEK swojej gry. Stare, węższe sprawdzenie staje się zbędne --
-- ten nowy warunek je obejmuje (bycie referencowanym przez grę z aktywnymi
-- ustawieniami zawsze implikuje "właściciel ma aktywny lock ustawień").
CREATE OR REPLACE FUNCTION "public"."delete_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    if exists (select 1 from public.games where id = p_resource_id and status = 'poll_open') then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'poll_open');
    end if;

    select resource_type into v_blocker
    from public.edit_locks
    where resource_type = 'game'
      and resource_id = p_resource_id
      and heartbeat_at > now() - interval '25 seconds'
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    delete from public.games where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'logo' then
    if not exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- Warstwa A: to konkretne logo ma aktywną sesję edycji gdzie indziej
    -- (logo-editor.js trzyma acquire_edit_lock('logo', ten id, ...)).
    if exists (
      select 1 from public.edit_locks
      where resource_type = 'logo'
        and resource_id = p_resource_id
        and heartbeat_at > now() - interval '25 seconds'
    ) then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- Warstwa B: cała pula logo właściciela jest busy, gdy ma aktywną
    -- rozgrywkę (Control) lub otwarte game-settings.js dla którejkolwiek
    -- swojej gry -- niezależnie od tego, czy TO konkretne logo jest przez
    -- nią referencowane.
    select holder_context into v_blocker
    from public.edit_locks
    where resource_type = 'game'
      and holder_user_id = v_uid
      and holder_context in ('settings', 'control')
      and heartbeat_at > now() - interval '25 seconds'
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', v_blocker.holder_context);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;

-- Nowa RPC: jedyna droga zapisu do user_logos poza INSERT (create) --
-- odpowiednik delete_resource_checked, ale dla UPDATE. Bez tego edycja
-- treści/nazwy logo omijałaby całkowicie warstwę "cała pula logo busy"
-- (dziś goły .update() nie sprawdzał NICZEGO poza RLS ownership).
CREATE OR REPLACE FUNCTION "public"."update_logo_checked"("p_logo_id" "uuid", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (select 1 from public.user_logos where id = p_logo_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  select holder_context into v_blocker
  from public.edit_locks
  where resource_type = 'game'
    and holder_user_id = v_uid
    and holder_context in ('settings', 'control')
    and heartbeat_at > now() - interval '25 seconds'
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'in_use', true, 'reason', v_blocker.holder_context);
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
