-- 091: Update market_admin_sync_cleanup to use storage_path instead of gh_slug

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
