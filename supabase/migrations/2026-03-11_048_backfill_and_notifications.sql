-- ============================================================
-- 048: Backfill istniejących wpisów biblioteki + konfiguracja
--      powiadomień push (ntfy.sh via pg_net)
-- ============================================================


-- --------------------------------------------------------
-- 1. Backfill: stwórz wiersze games/questions/answers dla
--    istniejących wpisów user_market_library (dodanych przed
--    migracją 047, która nie stworzyła dla nich wierszy games).
-- --------------------------------------------------------

DO $$
declare
    rec      record;
    v_q      jsonb;
    v_a      jsonb;
    v_q_id   uuid;
    v_ord    int;
    v_a_ord  int;
begin
    -- Dla każdej gry rynkowej w bibliotekach użytkowników,
    -- która nie ma jeszcze wiersza w games:
    for rec in
        select distinct on (uml.market_game_id)
               uml.user_id,
               uml.market_game_id,
               mg.title,
               mg.payload
          from public.user_market_library uml
          join public.market_games mg on mg.id = uml.market_game_id
         where not exists (
             select 1 from public.games where id = uml.market_game_id
         )
         order by uml.market_game_id, uml.created_at asc   -- pierwszy dodający
    loop
        -- Stwórz wiersz games
        insert into public.games
            (id, owner_id, name, type, status, source_market_id)
        values (
            rec.market_game_id,
            rec.user_id,
            left(rec.title, 80),
            'prepared',
            'ready',
            rec.market_game_id
        )
        on conflict (id) do nothing;

        -- Jeśli wiersz gry został stworzony, stwórz pytania i odpowiedzi
        if found then
            v_ord := 1;
            for v_q in
                select value from jsonb_array_elements(rec.payload -> 'questions')
            loop
                v_q_id := gen_random_uuid();

                insert into public.questions (id, game_id, ord, text)
                values (
                    v_q_id,
                    rec.market_game_id,
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
    end loop;
end $$;


-- --------------------------------------------------------
-- 2. Tabela app_config — proste key-value dla konfiguracji
--    aplikacji (np. temat ntfy.sh do powiadomień push).
--    Dostępna tylko przez SECURITY DEFINER RPCs (service role).
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key"   text NOT NULL,
    "value" text NOT NULL DEFAULT '',
    "note"  text,
    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- Brak RLS dla normalnych użytkowników — tabela ma być
-- dostępna wyłącznie przez SECURITY DEFINER funkcje.
ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;

-- Żaden zwykły użytkownik nie ma dostępu:
CREATE POLICY "app_config_no_access" ON "public"."app_config"
    USING (false);


-- --------------------------------------------------------
-- 3. RPCs do zarządzania app_config (wywoływane przez
--    Cloudflare Worker z service_role)
-- --------------------------------------------------------

CREATE FUNCTION "public"."admin_config_get"("p_key" text)
RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT value FROM public.app_config WHERE key = p_key;
$$;

CREATE FUNCTION "public"."admin_config_set"(
    "p_key"   text,
    "p_value" text,
    "p_note"  text DEFAULT NULL
)
RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    insert into public.app_config (key, value, note)
    values (p_key, coalesce(p_value, ''), p_note)
    on conflict (key) do update
        set value = excluded.value,
            note  = coalesce(excluded.note, app_config.note);
    return true;
end;
$$;


-- --------------------------------------------------------
-- 4. Powiadomienia push (ntfy.sh) przy nowym zgłoszeniu
--    do marketplace.
--    Wymagana: pg_net extension (domyślnie w Supabase).
--    Jeśli nie jest dostępna — blok jest pomijany cicho.
-- --------------------------------------------------------

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
    v_uid        uuid := auth.uid();
    v_game       public.games;
    v_can_play   boolean;
    v_new        uuid;
    v_ntfy_topic text;
begin
    -- musi być zalogowany
    if v_uid is null then
        return query select false, 'not_authenticated', null::uuid;
        return;
    end if;

    -- gra musi istnieć, być własnością usera i NIE być grą z marketplace
    select * into v_game
      from public.games
     where id = p_game_id
       and owner_id = v_uid
       and source_market_id is null;

    if v_game.id is null then
        return query select false, 'game_not_found', null::uuid;
        return;
    end if;

    -- gra musi być grywalna (sprawdza min. 10 pytań, zakresy punktów itd.)
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

    -- walidacja payload
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

    -- Powiadomienie ntfy.sh (pg_net) — cicho pomijane jeśli nie skonfigurowano
    begin
        select value into v_ntfy_topic
          from public.app_config
         where key = 'ntfy_topic';

        if v_ntfy_topic is not null and v_ntfy_topic <> '' then
            perform net.http_post(
                url     := 'https://ntfy.sh/' || v_ntfy_topic,
                body    := jsonb_build_object(
                    'title',    'Nowe zgłoszenie (' || p_lang || ')',
                    'message',  btrim(p_title),
                    'priority', 3
                ),
                headers := '{"Content-Type": "application/json"}'::jsonb
            );
        end if;
    exception when others then
        -- pg_net niedostępny lub błąd sieci — ignoruj
        null;
    end;

    return query select true, null::text, v_new;
end;
$$;
