-- ============================================================
-- 056: Auto-usuwanie odrzuconych gier z marketplace po 5 dniach
-- ============================================================


-- --------------------------------------------------------
-- 1. Funkcja czyszcząca
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."market_cleanup_rejected"()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_deleted integer;
begin
    delete from public.market_games
     where status = 'rejected'
       and updated_at < now() - interval '5 days';

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;


-- --------------------------------------------------------
-- 2. Cron: codziennie o 03:00 UTC
-- --------------------------------------------------------

do $$
begin
    begin
        perform cron.unschedule('familiada_market_cleanup');
    exception when others then
        null;
    end;

    perform cron.schedule(
        'familiada_market_cleanup',
        '0 3 * * *',
        'select public.market_cleanup_rejected()'
    );
exception when undefined_function then
    -- pg_cron nie jest dostępny — pomiń
    raise warning 'pg_cron unavailable, market_cleanup_rejected will not be scheduled';
end;
$$;
