-- ============================================================
-- 049: Gry marketplace — osobny games.id per użytkownik
--
-- Problem z migracją 047/048: games.id = market_game_id
-- (jeden wspólny wiersz) → ten sam share_key_display/host/buzzer
-- dla wszystkich użytkowników → wyświetlacz/host/buzzer się psują.
--
-- Nowa architektura:
--   • Każdy użytkownik dostaje własny wiersz w games
--     z nowym UUID i własnymi share_key_*
--   • games.source_market_id = market_game_id (FK + filtr)
--   • UNIQUE(owner_id, source_market_id) — max jeden wiersz per
--     użytkownik per gra marketplace
--   • "Graj" = redirect do control?id=<games.id> — zero importu,
--     użytkownik niczego nie widzi
-- ============================================================


-- --------------------------------------------------------
-- 1. Backfill: zamień stare współdzielone wiersze (games.id =
--    source_market_id) na osobne wiersze per użytkownik
-- --------------------------------------------------------

DO $$
declare
    uml_rec  record;
    v_mg     public.market_games%rowtype;
    v_new_id uuid;
    v_q      jsonb;
    v_a      jsonb;
    v_q_id   uuid;
    v_ord    int;
    v_a_ord  int;
begin
    -- Dla każdego wpisu w bibliotece gdzie istnieje stary wspólny wiersz
    -- (rozpoznawany po games.id = games.source_market_id)
    for uml_rec in
        select uml.user_id, uml.market_game_id
          from public.user_market_library uml
          join public.games g on g.id = uml.market_game_id
         where g.source_market_id = g.id   -- stary współdzielony wiersz
         order by uml.market_game_id, uml.created_at asc
    loop
        select * into v_mg
          from public.market_games
         where id = uml_rec.market_game_id;

        if not found then continue; end if;

        v_new_id := gen_random_uuid();

        insert into public.games
            (id, owner_id, name, type, status, source_market_id)
        values (
            v_new_id,
            uml_rec.user_id,
            left(v_mg.title, 80),
            'prepared',
            'ready',
            uml_rec.market_game_id
        );

        -- skopiuj pytania i odpowiedzi z payload
        v_ord := 1;
        for v_q in
            select value from jsonb_array_elements(v_mg.payload -> 'questions')
        loop
            v_q_id := gen_random_uuid();

            insert into public.questions (id, game_id, ord, text)
            values (v_q_id, v_new_id, v_ord, left(v_q ->> 'text', 200));

            v_a_ord := 1;
            for v_a in
                select value from jsonb_array_elements(v_q -> 'answers')
            loop
                insert into public.answers (question_id, ord, text, fixed_points)
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
    end loop;

    -- Usuń stare wspólne wiersze (kaskada usuwa ich pytania/odpowiedzi)
    delete from public.games where id = source_market_id;
end $$;


-- --------------------------------------------------------
-- 2. Unikalna para (owner_id, source_market_id) — max jeden
--    wiersz gry marketplace per użytkownik
-- --------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "games_owner_market_uniq"
    ON "public"."games" ("owner_id", "source_market_id")
    WHERE "source_market_id" IS NOT NULL;


-- --------------------------------------------------------
-- 3. Usuń polityki RLS dodane w migracji 047 — nie są już
--    potrzebne, każdy user jest właścicielem swojego wiersza
-- --------------------------------------------------------

DROP POLICY IF EXISTS "games_market_library_select"     ON "public"."games";
DROP POLICY IF EXISTS "questions_market_library_select" ON "public"."questions";
DROP POLICY IF EXISTS "answers_market_library_select"   ON "public"."answers";


-- --------------------------------------------------------
-- 4. market_add_to_library — per-user UUID, bez widocznego
--    kopiowania po stronie użytkownika
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
    v_q     jsonb;
    v_a     jsonb;
    v_q_id  uuid;
    v_ord   int;
    v_a_ord int;
    v_rows  int;
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

    -- dodaj do user_market_library
    insert into public.user_market_library (user_id, market_game_id)
    values (v_uid, p_market_game_id)
    on conflict do nothing;

    -- stwórz własny wiersz games z nowym UUID
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

    -- jeśli wiersz był nowy — stwórz pytania i odpowiedzi
    if v_rows > 0 then
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
    end if;

    return query select true, '';
end;
$$;


-- --------------------------------------------------------
-- 5. market_remove_from_library — usuwa też wiersz games
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

    -- usuń z user_market_library
    delete from public.user_market_library
     where user_id       = v_uid
       and market_game_id = p_market_game_id;

    -- usuń własny wiersz games (kaskada usuwa pytania i odpowiedzi)
    delete from public.games
     where owner_id        = v_uid
       and source_market_id = p_market_game_id;

    return query select true, '';
end;
$$;


-- --------------------------------------------------------
-- 6. market_my_library — zwraca game_id (per-user UUID)
--    DROP wymagany bo zmienia się sygnatura zwracanego TYPE
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
