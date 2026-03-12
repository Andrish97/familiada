-- 058: market_admin_delete — dodaj p_force aby admin mógł usunąć gry z GH

CREATE OR REPLACE FUNCTION "public"."market_admin_delete"("p_id" uuid, "p_force" boolean DEFAULT false)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    -- gry z GitHub mogą być usunięte tylko przez admina z p_force = true
    if not p_force and exists (
        select 1 from public.market_games
         where id = p_id and gh_slug is not null
    ) then
        return query select false, 'gh_game_cannot_be_deleted';
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
