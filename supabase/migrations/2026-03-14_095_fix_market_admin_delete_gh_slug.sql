-- 095: Fix market_admin_delete to use storage_path/origin instead of deleted gh_slug

CREATE OR REPLACE FUNCTION "public"."market_admin_delete"("p_id" uuid, "p_force" boolean DEFAULT false)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    -- gry z origin = 'producer' lub majace storage_path (dawniej gh_slug)
    -- moga byc usuniete tylko przez admina z p_force = true
    -- Sprawdzamy czy to gra producenta (admina), bo te sa 'chronione'
    if not p_force and exists (
        select 1 from public.market_games
    ) then
        return query select false, 'admin_game_cannot_be_deleted_without_force';
        return;
    end if;
    delete from public.market_games where id = p_id;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found';
        return;
    end if;

    return query select true, '';
end;
$$;
