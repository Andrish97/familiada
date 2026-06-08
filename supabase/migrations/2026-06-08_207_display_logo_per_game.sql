-- display_logo_get_public: use per-game logoId from settings, fallback to is_active

CREATE OR REPLACE FUNCTION public.display_logo_get_public(p_game_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_owner    uuid;
  v_ok       boolean;
  v_logo_id  uuid;
  v_logo     jsonb;
begin
  select (g.share_key_display = p_key),
         g.owner_id,
         (g.settings -> 'display' ->> 'logoId')::uuid
    into v_ok, v_owner, v_logo_id
  from public.games g
  where g.id = p_game_id;

  if v_ok is distinct from true then
    return null;
  end if;

  -- per-game logo from settings.display.logoId
  if v_logo_id is not null then
    select jsonb_build_object('type', ul.type, 'payload', ul.payload, 'name', ul.name)
      into v_logo
    from public.user_logos ul
    where ul.id = v_logo_id and ul.user_id = v_owner;

    if v_logo is not null then
      return v_logo;
    end if;
  end if;

  -- fallback: globally active logo
  select jsonb_build_object('type', ul.type, 'payload', ul.payload, 'name', ul.name)
    into v_logo
  from public.user_logos ul
  where ul.user_id = v_owner and ul.is_active = true
  limit 1;

  return v_logo;
end $$;
