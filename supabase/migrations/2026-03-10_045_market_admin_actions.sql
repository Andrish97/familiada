-- ==========================================================
-- 045: Admin marketplace actions — force-withdraw + hard-delete
-- ==========================================================

-- --------------------------------------------------------
-- 1. market_admin_withdraw — wymusza status = 'withdrawn'
--    na dowolnej opublikowanej grze (niezależnie od autora).
--    Gra znika z browse, ale zostaje w bibliotekach tych,
--    którzy ją już dodali.
-- --------------------------------------------------------
CREATE FUNCTION "public"."market_admin_withdraw"("p_id" uuid)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    update public.market_games
       set status = 'withdrawn',
           updated_at = now()
     where id = p_id
       and status = 'published';

    if not found then
        return query select false, 'not_found_or_not_published';
        return;
    end if;

    return query select true, '';
end;
$$;


-- --------------------------------------------------------
-- 2. market_admin_delete — trwale usuwa grę.
--    ON DELETE CASCADE usuwa wiersze z user_market_library
--    i trigger library_count nie odpali (DELETE CASCADE jest
--    po stronie DB — zamiast tego library_count staje się
--    nieistotny bo wiersz market_games znika).
-- --------------------------------------------------------
CREATE FUNCTION "public"."market_admin_delete"("p_id" uuid)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    delete from public.market_games where id = p_id;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found';
        return;
    end if;

    return query select true, '';
end;
$$;
