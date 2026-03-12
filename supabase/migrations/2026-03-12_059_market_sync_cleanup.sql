-- 059: market_admin_sync_cleanup — usuwa gry GH których nie ma w aktualnym index.json

CREATE OR REPLACE FUNCTION "public"."market_admin_sync_cleanup"("p_slugs" text[])
RETURNS TABLE("deleted" int, "slugs" text[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_slugs text[];
    v_count int;
begin
    -- zbierz slug-i które zostaną usunięte (do logowania)
    select array_agg(gh_slug)
      into v_slugs
      from public.market_games
     where gh_slug is not null
       and gh_slug != all(p_slugs);

    -- usuń
    delete from public.market_games
     where gh_slug is not null
       and gh_slug != all(p_slugs);

    get diagnostics v_count = row_count;

    return query select v_count, coalesce(v_slugs, '{}'::text[]);
end;
$$;
