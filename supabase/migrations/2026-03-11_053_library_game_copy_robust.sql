-- ============================================================
-- 053: Solidna architektura kopii gier marketplace
--
-- Problem: games.source_market_id FK ma ON DELETE CASCADE →
--   kasowanie market_games niszczy kopie użytkowników.
--   LEFT JOIN w market_my_library może zwrócić NULL gdy wiersz
--   games nie istnieje (różne okna czasowe migracji).
--
-- Nowa architektura:
--   • FK ON DELETE SET NULL zamiast CASCADE → kopia przeżywa
--     usunięcie/wycofanie gry przez właściciela
--   • user_market_library.game_id przechowuje UUID lokalnej kopii
--     → market_my_library używa tej kolumny zamiast LEFT JOIN
--   • market_add_to_library zapisuje game_id w uml
--   • market_remove_from_library usuwa lokalną grę + wpis
-- ============================================================


-- --------------------------------------------------------
-- 1. FK: zmień ON DELETE CASCADE → ON DELETE SET NULL
--    (kopia gry przeżywa usunięcie gry z marketu)
-- --------------------------------------------------------

ALTER TABLE "public"."games"
    DROP CONSTRAINT "games_source_market_id_fkey";

ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_source_market_id_fkey"
    FOREIGN KEY ("source_market_id")
    REFERENCES "public"."market_games"("id")
    ON DELETE SET NULL;


-- --------------------------------------------------------
-- 2. Kolumna user_market_library.game_id
--    → bezpośredni UUID lokalnej kopii, bez LEFT JOIN
-- --------------------------------------------------------

ALTER TABLE "public"."user_market_library"
    ADD COLUMN IF NOT EXISTS "game_id" uuid
    REFERENCES "public"."games"("id") ON DELETE SET NULL;


-- --------------------------------------------------------
-- 3. Backfill user_market_library.game_id z istniejących
--    wierszy games (per-user kopie z migracji _049)
-- --------------------------------------------------------

UPDATE "public"."user_market_library" uml
   SET game_id = g.id
  FROM "public"."games" g
 WHERE g.source_market_id = uml.market_game_id
   AND g.owner_id          = uml.user_id
   AND uml.game_id IS NULL;


-- --------------------------------------------------------
-- 4. market_my_library — używa uml.game_id zamiast LEFT JOIN
-- --------------------------------------------------------

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
        uml.game_id       AS game_id,
        mg.title,
        mg.lang,
        COALESCE(pr.username, '') AS author_username,
        mg.status,
        uml.created_at    AS added_at
    FROM public.user_market_library uml
    JOIN public.market_games mg  ON mg.id = uml.market_game_id
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE uml.user_id = auth.uid()
    ORDER BY uml.created_at DESC;
$$;


-- --------------------------------------------------------
-- 5. market_add_to_library — zapisuje game_id w uml
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."market_add_to_library"(
    "p_market_game_id" uuid
)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_uid   uuid := auth.uid();
    v_mg    public.market_games%rowtype;
    v_new   uuid;
    v_rows  int;
    v_q     jsonb;
    v_a     jsonb;
    v_q_id  uuid;
    v_ord   int;
    v_a_ord int;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    select * into v_mg
      from public.market_games
     where id = p_market_game_id
       and status in ('published', 'withdrawn');

    if not found then
        return query select false, 'game_not_available';
        return;
    end if;

    -- stwórz lokalną kopię (per-user UUID, owner = v_uid)
    v_new := gen_random_uuid();

    insert into public.games
        (id, owner_id, name, type, status, source_market_id)
    values (
        v_new,
        v_uid,
        left(v_mg.title, 80),
        'prepared',
        'ready',
        p_market_game_id
    )
    on conflict (owner_id, source_market_id)
    where source_market_id is not null
    do nothing;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
        -- skopiuj pytania i odpowiedzi z payload
        v_ord := 1;
        for v_q in
            select value from jsonb_array_elements(v_mg.payload -> 'questions')
        loop
            v_q_id := gen_random_uuid();

            insert into public.questions (id, game_id, ord, text)
            values (v_q_id, v_new, v_ord, left(v_q ->> 'text', 200));

            v_a_ord := 1;
            for v_a in
                select value from jsonb_array_elements(v_q -> 'answers')
            loop
                insert into public.answers
                    (question_id, ord, text, fixed_points)
                values (
                    v_q_id,
                    v_a_ord,
                    left(v_a ->> 'text', 17),
                    coalesce((v_a ->> 'fixed_points')::int, 0)
                );
                v_a_ord := v_a_ord + 1;
            end loop;

            v_ord := v_ord + 1;
        end loop;
    else
        -- wiersz już istniał — pobierz jego UUID
        select id into v_new
          from public.games
         where owner_id = v_uid
           and source_market_id = p_market_game_id;
    end if;

    -- dodaj/zaktualizuj wpis biblioteczny z game_id
    insert into public.user_market_library (user_id, market_game_id, game_id)
    values (v_uid, p_market_game_id, v_new)
    on conflict (user_id, market_game_id) do update
        set game_id = excluded.game_id;

    return query select true, '';
end;
$$;


-- --------------------------------------------------------
-- 6. market_remove_from_library — usuwa kopię gry + wpis
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."market_remove_from_library"(
    "p_market_game_id" uuid
)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    -- usuń lokalną kopię gry (kaskada usuwa pytania i odpowiedzi)
    delete from public.games
     where owner_id        = v_uid
       and source_market_id = p_market_game_id;

    -- usuń wpis biblioteczny
    delete from public.user_market_library
     where user_id        = v_uid
       and market_game_id = p_market_game_id;

    return query select true, '';
end;
$$;
