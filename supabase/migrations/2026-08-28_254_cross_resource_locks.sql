-- Krok 2.5 audytu "wielu miejsc naraz" (docs/plan-testy-i-poprawki.md,
-- sekcja "Krzyżowe blokady między zasobami"): generyczny mechanizm
-- krzyżowych blokad zamiast N osobnych łatek per para zasobów.
--
-- Dwie zmiany:
-- 1) acquire_edit_lock dostaje trzeci wynik: 'gone' (zasób w ogóle już
--    nie istnieje — przegrany wyścig z usunięciem gdzie indziej),
--    odróżniony od dotychczasowego 'locked' (zajęte przez kogoś innego).
-- 2) Nowe RPC delete_resource_checked — zastępuje gołe
--    .from(...).delete() w builder.js (gra) i logo-editor (logo).
--    Sprawdza i usuwa ATOMOWO w jednej transakcji (nie check-potem-delete
--    z dwóch osobnych round-tripów z klienta, bo to zostawiałoby wyścig).

CREATE OR REPLACE FUNCTION "public"."acquire_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text") RETURNS "jsonb"
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

  if p_resource_type in ('game_editor', 'game_settings', 'poll', 'control') then
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
    -- Zasób usunięty gdzie indziej, zanim zdążyliśmy go zająć (albo w
    -- trakcie odnawiania heartbeatu). Odróżniamy od 'locked': tu nie ma
    -- sensu odpytywać ponownie, bo nigdy się nie "zwolni" — wywołujący
    -- (guardResourceLock) pokazuje inny komunikat i nie odpala pollingu.
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;

  if not v_can then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.edit_locks (resource_type, resource_id, holder_tab_id, holder_user_id, acquired_at, heartbeat_at)
  values (p_resource_type, p_resource_id, p_tab_id, v_uid, now(), now())
  on conflict (resource_type, resource_id) do update
    set holder_tab_id = excluded.holder_tab_id,
        holder_user_id = excluded.holder_user_id,
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

-- Generyczne RPC usuwania z twardym sprawdzeniem "w użyciu" — jedna
-- funkcja, dispatch per typ zasobu wewnątrz (te same resolvery "kto się
-- do mnie odwołuje" będą dokładane tu, nie w N osobnych miejscach, gdy
-- dojdzie kolej na kolejne strony/zasoby z planu).
--
-- Zasada ustalona w dyskusji: blokuj TYLKO gdy odwołujący się zasób ma
-- TERAZ aktywną, żywą sesję (edit_locks z heartbeatem < 25s) — sama
-- referencja bez żywej strony po drugiej stronie nie blokuje (to już
-- bezpieczne dzięki Warstwie 2 gdzie indziej: odśwież-i-przefiltruj).
CREATE FUNCTION "public"."delete_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid") RETURNS "jsonb"
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

    -- Żywa ankieta = ktoś aktualnie głosuje — usunięcie zerwałoby
    -- wszystkim sesję bez ostrzeżenia.
    if exists (select 1 from public.games where id = p_resource_id and status = 'poll_open') then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'poll_open');
    end if;

    -- Ktoś ma teraz otwarty edytor/ustawienia/ankietę/control tej gry.
    select resource_type into v_blocker
    from public.edit_locks
    where resource_type in ('game_editor', 'game_settings', 'poll', 'control')
      and resource_id = p_resource_id
      and heartbeat_at > now() - interval '25 seconds'
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked', 'blocker_type', v_blocker.resource_type);
    end if;

    delete from public.games where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'logo' then
    if not exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- Gry (tego samego właściciela) referencujące to logo w
    -- settings.display.logoId, z TERAZ otwartymi ustawieniami. Kontrola
    -- rozgrywki (Control) celowo pominięta — nie ma jeszcze żadnego
    -- sygnału żywotności (patrz plan, sekcja Control).
    select g.id as game_id into v_blocker
    from public.games g
    join public.edit_locks el
      on el.resource_type = 'game_settings'
     and el.resource_id = g.id
     and el.heartbeat_at > now() - interval '25 seconds'
    where g.owner_id = v_uid
      and (g.settings #>> '{display,logoId}') = p_resource_id::text
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked', 'blocker_type', 'game_settings', 'blocker_game_id', v_blocker.game_id);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;
