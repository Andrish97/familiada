-- ============================================================
-- 051: Naprawa market_add_to_library — ON CONFLICT ON CONSTRAINT
--      nie działa z CREATE UNIQUE INDEX (tylko z ADD CONSTRAINT).
--      Zamiana na ON CONFLICT (col, col) WHERE ... który
--      poprawnie referencjonuje częściowy unique index.
-- ============================================================

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
    -- referencja do partial unique index (nie constraint)
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
