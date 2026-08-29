-- Korekta Warstwy 1 (docs/plan-testy-i-poprawki.md): editor.js i
-- game-settings.js (i docelowo polls.js/control) NIE są niezależnymi
-- zasobami dla tej samej gry — operują na tych samych, powiązanych danych
-- (edytor zmienia pytania, ustawienia wybierają z tych samych pytań
-- finał/rundy), więc powinny się wzajemnie wykluczać: kto pierwszy
-- otworzy dowolną z tych stron dla danej gry, ten trzyma blokadę; każda
-- inna strona próbująca wejść na TĘ SAMĄ grę dostaje overlay "zajęte",
-- niezależnie od tego, która konkretnie strona to jest.
--
-- Implementacja: zamiast czterech osobnych resource_type
-- ('game_editor'/'game_settings'/'poll'/'control') na tę samą grę —
-- jeden wspólny typ 'game'. Komunikat na overlayu rozróżnia tylko TYP
-- zasobu (gra/logo/baza), nie która strona trzyma blokadę.

-- Sprzątanie: stare wiersze pod dawnymi typami stają się martwe (JS
-- zacznie pisać pod 'game'), nie mają już sensu.
DELETE FROM public.edit_locks WHERE resource_type IN ('game_editor', 'game_settings', 'poll', 'control');

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

    -- Jeden wspólny typ 'game' zamiast dawnej listy game_editor/
    -- game_settings/poll/control.
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

    select g.id as game_id into v_blocker
    from public.games g
    join public.edit_locks el
      on el.resource_type = 'game'
     and el.resource_id = g.id
     and el.heartbeat_at > now() - interval '25 seconds'
    where g.owner_id = v_uid
      and (g.settings #>> '{display,logoId}') = p_resource_id::text
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked', 'blocker_game_id', v_blocker.game_id);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;

DROP POLICY IF EXISTS "edit_locks_read_if_can_edit_resource" ON "public"."edit_locks";
CREATE POLICY "edit_locks_read_if_can_edit_resource" ON "public"."edit_locks"
    FOR SELECT TO "authenticated"
    USING (
      CASE resource_type
        WHEN 'game'  THEN EXISTS (SELECT 1 FROM public.games WHERE id = resource_id AND owner_id = auth.uid())
        WHEN 'logo'  THEN EXISTS (SELECT 1 FROM public.user_logos WHERE id = resource_id AND user_id = auth.uid())
        WHEN 'base'  THEN public.base_can_edit(resource_id, auth.uid())
        ELSE false
      END
    );
