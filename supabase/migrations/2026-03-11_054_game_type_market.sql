-- ============================================================
-- 054: Dodaj wartość 'market' do game_type enum
--
-- Kopie gier pobranych z marketplace dostają type = 'market'
-- zamiast 'prepared', co pozwala wyodrębnić je na osobnej
-- zakładce w builderze i łatwo filtrować.
-- ============================================================


-- --------------------------------------------------------
-- 1. Dodaj wartość do enuma (idempotentne)
-- --------------------------------------------------------

ALTER TYPE "public"."game_type" ADD VALUE IF NOT EXISTS 'market';


-- --------------------------------------------------------
-- 2. Oznacz istniejące kopie marketowe
-- --------------------------------------------------------

UPDATE "public"."games"
   SET type = 'market'
 WHERE source_market_id IS NOT NULL
   AND type != 'market';


-- --------------------------------------------------------
-- 3. Zaktualizuj market_add_to_library — nowe kopie też market
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

    -- stwórz lokalną kopię (type = 'market', per-user UUID, owner = v_uid)
    v_new := gen_random_uuid();

    insert into public.games
        (id, owner_id, name, type, status, source_market_id)
    values (
        v_new,
        v_uid,
        left(v_mg.title, 80),
        'market',
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
