-- ============================================================
-- 050: Naprawa market_my_library — zmiana sygnatury (dodanie
--      game_id) wymaga DROP + CREATE zamiast CREATE OR REPLACE.
--
--      Migracja 049 nie mogła użyć CREATE OR REPLACE bo dodała
--      nową kolumnę game_id do zwracanego TYPE.
-- ============================================================

DROP FUNCTION IF EXISTS "public"."market_my_library"();

CREATE FUNCTION "public"."market_my_library"()
RETURNS TABLE(
    "market_game_id"  uuid,
    "game_id"         uuid,
    "title"           text,
    "lang"            text,
    "author_username" text,
    "status"          public.market_game_status,
    "added_at"        timestamptz
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id             AS market_game_id,
        g.id              AS game_id,
        mg.title,
        mg.lang,
        COALESCE(pr.username, '') AS author_username,
        mg.status,
        uml.created_at    AS added_at
    FROM public.user_market_library uml
    JOIN public.market_games mg  ON mg.id = uml.market_game_id
    LEFT JOIN public.games g     ON g.owner_id = auth.uid()
                                AND g.source_market_id = uml.market_game_id
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE uml.user_id = auth.uid()
    ORDER BY uml.created_at DESC;
$$;
