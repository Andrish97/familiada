-- ============================================================
-- 052: Backfill brakujących wierszy games per użytkownik
--
-- Pokrywa przypadek: użytkownik dodał grę do biblioteki gdy
-- market_add_to_library miała błędną składnię ON CONFLICT
-- (migracja _049 przed poprawką _051). Wpis w user_market_library
-- istnieje, ale brak wiersza w games.
-- ============================================================

DO $$
declare
    uml_rec  record;
    v_mg     public.market_games%rowtype;
    v_new    uuid;
    v_rows   int;
    v_q      jsonb;
    v_a      jsonb;
    v_q_id   uuid;
    v_ord    int;
    v_a_ord  int;
begin
    for uml_rec in
        select uml.user_id, uml.market_game_id
          from public.user_market_library uml
         where not exists (
             select 1 from public.games g
              where g.owner_id        = uml.user_id
                and g.source_market_id = uml.market_game_id
         )
         order by uml.market_game_id, uml.created_at asc
    loop
        select * into v_mg
          from public.market_games
         where id = uml_rec.market_game_id;

        if not found then continue; end if;

        v_new := gen_random_uuid();

        insert into public.games
            (id, owner_id, name, type, status, source_market_id)
        values (
            v_new,
            uml_rec.user_id,
            left(v_mg.title, 80),
            'prepared',
            'ready',
            uml_rec.market_game_id
        )
        on conflict (owner_id, source_market_id)
        where source_market_id is not null
        do nothing;

        get diagnostics v_rows = row_count;

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
    end loop;
end $$;
