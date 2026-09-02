-- Rozszerza delete_resource_checked() o resource_type='base' (usunięcie
-- całej bazy pytań z bases.js). qb_questions/qb_categories/qb_tags mają
-- ON DELETE CASCADE od question_bases -- bez tej blokady usunięcie bazy
-- kasowałoby też elementy, które ktoś aktywnie edytuje w base-explorerze
-- (Warstwa 1 z migracji 257), bez żadnego ostrzeżenia.

CREATE OR REPLACE FUNCTION public.delete_resource_checked(
  p_resource_type text,
  p_resource_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- Którykolwiek element WEWNĄTRZ tej bazy (pytanie/folder/tag) ma teraz
    -- aktywną sesję edycji (Warstwa 1, migracja 257) -- usunięcie całej
    -- bazy skasowałoby go (CASCADE) spod ręki edytującego bez ostrzeżenia.
    if exists (
      select 1 from public.edit_locks l
      where l.heartbeat_at > now() - interval '25 seconds'
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
