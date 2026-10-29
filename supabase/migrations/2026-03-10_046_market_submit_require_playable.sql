-- Migration: require can_play before submitting game to marketplace
-- Replaces the loose type+status check with a proper game_action_state can_play check.

CREATE OR REPLACE FUNCTION "public"."market_submit_game"(
    "p_game_id"     uuid,
    "p_title"       text,
    "p_description" text,
    "p_lang"        text,
    "p_payload"     jsonb
)
RETURNS TABLE("ok" boolean, "err" text, "market_id" uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_uid      uuid := auth.uid();
    v_game     public.games;
    v_can_play boolean;
    v_new      uuid;
begin
    -- musi być zalogowany
    if v_uid is null then
        return query select false, 'not_authenticated', null::uuid;
        return;
    end if;

    -- gra musi istnieć i należeć do usera
    select * into v_game
      from public.games
     where id = p_game_id and owner_id = v_uid;

    if v_game.id is null then
        return query select false, 'game_not_found', null::uuid;
        return;
    end if;

    -- gra musi być grywalna (can_play = true) — sprawdza m.in. min. 10 pytań, zakresy punktów itd.
    select can_play into v_can_play from public.game_action_state(p_game_id);
    if not coalesce(v_can_play, false) then
        return query select false, 'game_not_playable', null::uuid;
        return;
    end if;

    -- walidacja lang
    if p_lang not in ('pl', 'en', 'uk') then
        return query select false, 'invalid_lang', null::uuid;
        return;
    end if;

    -- walidacja tytułu
    if char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 120 then
        return query select false, 'invalid_title', null::uuid;
        return;
    end if;

    -- walidacja payload (musi mieć game + questions)
    if p_payload -> 'game' is null or p_payload -> 'questions' is null then
        return query select false, 'invalid_payload', null::uuid;
        return;
    end if;

    -- payload musi mieć co najmniej 10 pytań
    if jsonb_array_length(p_payload -> 'questions') < 10 then
        return query select false, 'too_few_questions', null::uuid;
        return;
    end if;

    insert into public.market_games
        (author_user_id, source_game_id, title, description, lang, status, payload)
    values
        (v_uid, p_game_id, btrim(p_title), btrim(coalesce(p_description, '')), p_lang, 'pending', p_payload)
    returning id into v_new;

    return query select true, null::text, v_new;
end;
$$;
