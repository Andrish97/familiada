-- Precyzyjne blokady elementów współdzielonej bazy pytań. Nie blokujemy
-- całej bazy: owner i editor nadal mogą równolegle pracować nad różnymi
-- pytaniami/folderami/tagami.

CREATE OR REPLACE FUNCTION public.can_edit_locked_resource(
  p_resource_type text,
  p_resource_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE p_resource_type
    WHEN 'game' THEN EXISTS (
      SELECT 1 FROM public.games WHERE id = p_resource_id AND owner_id = auth.uid()
    )
    WHEN 'logo' THEN EXISTS (
      SELECT 1 FROM public.user_logos WHERE id = p_resource_id AND user_id = auth.uid()
    )
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

DROP POLICY IF EXISTS edit_locks_read_if_can_edit_resource ON public.edit_locks;
CREATE POLICY edit_locks_read_if_can_edit_resource ON public.edit_locks
  FOR SELECT TO authenticated
  USING (public.can_edit_locked_resource(resource_type, resource_id));

-- Zachowuje kontrakt i trójstan istniejącego RPC, ale rozszerza walidację o
-- elementy bazy. Sprawdzenie istnienia zasobu i uprawnienia odbywa się po
-- stronie serwera; klient nie może założyć blokady na cudzym UUID.
CREATE OR REPLACE FUNCTION public.acquire_edit_lock(
  p_resource_type text,
  p_resource_id uuid,
  p_tab_id text,
  p_context text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
  v_got boolean;
  v_row public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(trim(p_tab_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_tab_id');
  end if;
  if p_resource_type not in ('game', 'logo', 'base', 'base_question', 'base_folder', 'base_tag') then
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
  v_exists := case p_resource_type
    when 'game' then exists (select 1 from public.games where id = p_resource_id)
    when 'logo' then exists (select 1 from public.user_logos where id = p_resource_id)
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

  insert into public.edit_locks
    (resource_type, resource_id, holder_tab_id, holder_user_id, holder_context, acquired_at, heartbeat_at)
  values
    (p_resource_type, p_resource_id, p_tab_id, v_uid, p_context, now(), now())
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
  select * into v_row from public.edit_locks
   where resource_type = p_resource_type and resource_id = p_resource_id;
  return jsonb_build_object('ok', false, 'error', 'locked',
    'holder_user_id', v_row.holder_user_id, 'acquired_at', v_row.acquired_at);
end;
$$;
