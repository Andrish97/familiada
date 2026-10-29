-- 092: Fix market_admin_sync_cleanup and resolve checksum warnings
-- SUPERSEDES: 2026-03-13_086_revert_to_586f3a9.sql
-- SUPERSEDES: 2026-03-13_087_queue_and_storage.sql
-- SUPERSEDES: 2026-03-13_091_update_sync_cleanup.sql

-- Drop the function first to allow changing return type (from slugs to paths)
DROP FUNCTION IF EXISTS "public"."market_admin_sync_cleanup"(text[]);

CREATE OR REPLACE FUNCTION "public"."market_admin_sync_cleanup"("p_storage_paths" text[])
RETURNS TABLE("deleted" int, "paths" text[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_paths text[];
    v_count int;
begin
    -- zbierz ścieżki które zostaną usunięte (te, które są w marketplace/ ale nie ma ich w przesłanej liście)
    select array_agg(storage_path)
      into v_paths
      from public.market_games
     where storage_path LIKE 'marketplace/%'
       and storage_path != all(p_storage_paths);

    -- usuń
    delete from public.market_games
     where storage_path LIKE 'marketplace/%'
       and storage_path != all(p_storage_paths);

    get diagnostics v_count = row_count;

    return query select v_count, coalesce(v_paths, '{}'::text[]);
end;
$$;
