-- ============================================================
-- 047: Market games as real games (zero-copy play)
--
-- Architektura:
--   • games.id = market_games.id (ten sam UUID)
--   • games.source_market_id → market_games.id ON DELETE CASCADE
--   • Jeden wiersz games per market game (współdzielony);
--     owner_id = użytkownik który dodał pierwszy
--   • Pozostali użytkownicy biblioteki odczytują wiersz przez
--     nową politykę RLS (user_market_library)
--   • "Graj" = redirect do control?id=<market_game_id>, zero importu
-- ============================================================


-- --------------------------------------------------------
-- 1. Nowa kolumna games.source_market_id
-- --------------------------------------------------------

ALTER TABLE "public"."games"
    ADD COLUMN "source_market_id" uuid
    REFERENCES "public"."market_games"("id") ON DELETE CASCADE;

CREATE INDEX "games_source_market_id_idx"
    ON "public"."games" ("source_market_id")
    WHERE "source_market_id" IS NOT NULL;


-- --------------------------------------------------------
-- 2. Nowe polityki RLS — odczyt gier z biblioteki rynkowej
-- --------------------------------------------------------

-- games: użytkownik który ma grę w swojej bibliotece rynkowej
--        może odczytać wiersz (owner może go już czytać przez
--        games_owner_select, tu obsługujemy pozostałych)
CREATE POLICY "games_market_library_select"
    ON "public"."games"
    FOR SELECT TO "authenticated"
    USING (
        source_market_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM "public"."user_market_library" uml
             WHERE uml.market_game_id = "games"."source_market_id"
               AND uml.user_id        = auth.uid()
        )
    );

-- questions: odczyt pytań gry rynkowej przez uczestnika biblioteki
CREATE POLICY "questions_market_library_select"
    ON "public"."questions"
    FOR SELECT TO "authenticated"
    USING (
        EXISTS (
            SELECT 1 FROM "public"."user_market_library" uml
             WHERE uml.market_game_id = "questions"."game_id"
               AND uml.user_id        = auth.uid()
        )
    );

-- answers: odczyt odpowiedzi pytań gry rynkowej przez uczestnika biblioteki
CREATE POLICY "answers_market_library_select"
    ON "public"."answers"
    FOR SELECT TO "authenticated"
    USING (
        EXISTS (
            SELECT 1
              FROM "public"."questions" q
              JOIN "public"."user_market_library" uml
                ON uml.market_game_id = q.game_id
             WHERE q.id         = "answers"."question_id"
               AND uml.user_id  = auth.uid()
        )
    );


-- --------------------------------------------------------
-- 3. market_add_to_library — rozszerzona wersja
--    • wstawia do user_market_library (jak poprzednio)
--    • wstawia wiersz do games z id = market_game_id
--      (ON CONFLICT DO NOTHING — drugi user korzysta przez RLS)
--    • jeśli games był nowy, wstawia pytania i odpowiedzi
--      z payload market game
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."market_add_to_library"(
    "p_market_game_id" uuid
)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_uid    uuid := auth.uid();
    v_mg     public.market_games%rowtype;
    v_q      jsonb;
    v_a      jsonb;
    v_q_id   uuid;
    v_ord    int;
    v_a_ord  int;
    v_rows   int;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    -- gra musi być published lub withdrawn
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

    -- dodaj do games (ten sam UUID); jeśli już istnieje — nic nie rób,
    -- pozostali użytkownicy korzystają przez politykę RLS
    insert into public.games
        (id, owner_id, name, type, status, source_market_id)
    values (
        p_market_game_id,
        v_uid,
        left(v_mg.title, 80),
        'prepared',
        'ready',
        p_market_game_id
    )
    on conflict (id) do nothing;

    get diagnostics v_rows = row_count;

    -- tylko pierwszy użytkownik tworzy pytania i odpowiedzi
    if v_rows > 0 then
        v_ord := 1;
        for v_q in
            select value from jsonb_array_elements(v_mg.payload -> 'questions')
        loop
            v_q_id := gen_random_uuid();

            insert into public.questions (id, game_id, ord, text)
            values (
                v_q_id,
                p_market_game_id,
                v_ord,
                left(v_q ->> 'text', 200)
            );

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
-- 4. market_remove_from_library — tylko usuwa z biblioteki;
--    wiersz games pozostaje (współdzielony z innymi userami
--    i kasowany kaskadowo gdy market_game zostanie usunięty)
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

    delete from public.user_market_library
     where user_id       = v_uid
       and market_game_id = p_market_game_id;

    return query select true, '';
end;
$$;


-- --------------------------------------------------------
-- 5. market_admin_delete — blokada usuwania gier z GH
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."market_admin_delete"("p_id" uuid)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    -- gry z GitHub mogą być zarządzane tylko przez synchronizację
    if exists (
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
