-- ============================================================
-- Marketplace
-- ============================================================

-- --------------------------------------------------------
-- 1. ENUM
-- --------------------------------------------------------

CREATE TYPE "public"."market_game_status" AS ENUM (
    'pending',
    'published',
    'withdrawn',
    'rejected'
);


-- --------------------------------------------------------
-- 2. TABLES
-- --------------------------------------------------------

CREATE TABLE "public"."market_games" (
    "id"               uuid                     DEFAULT gen_random_uuid() NOT NULL,
    "source_game_id"   uuid,
    "author_user_id"   uuid,
    "title"            text                     NOT NULL,
    "description"      text                     NOT NULL DEFAULT '',
    "lang"             text                     NOT NULL,
    "payload"          jsonb                    NOT NULL,
    "status"           public.market_game_status NOT NULL DEFAULT 'pending',
    "moderation_note"  text,
    "gh_slug"          text,
    "library_count"    integer                  NOT NULL DEFAULT 0,
    "created_at"       timestamptz              NOT NULL DEFAULT now(),
    "updated_at"       timestamptz              NOT NULL DEFAULT now(),
    CONSTRAINT "market_games_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "market_games_gh_slug_key" UNIQUE ("gh_slug"),
    CONSTRAINT "market_games_lang_check" CHECK (lang IN ('pl', 'en', 'uk')),
    CONSTRAINT "market_games_title_len" CHECK (
        char_length(title) >= 1 AND char_length(title) <= 120
    ),
    CONSTRAINT "market_games_library_count_nn" CHECK (library_count >= 0)
);

ALTER TABLE "public"."market_games"
    ADD CONSTRAINT "market_games_source_game_fkey"
    FOREIGN KEY ("source_game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;

ALTER TABLE "public"."market_games"
    ADD CONSTRAINT "market_games_author_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


CREATE TABLE "public"."user_market_library" (
    "user_id"         uuid        NOT NULL,
    "market_game_id"  uuid        NOT NULL,
    "created_at"      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "user_market_library_pkey" PRIMARY KEY ("user_id", "market_game_id")
);

ALTER TABLE "public"."user_market_library"
    ADD CONSTRAINT "uml_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."user_market_library"
    ADD CONSTRAINT "uml_market_game_fkey"
    FOREIGN KEY ("market_game_id") REFERENCES "public"."market_games"("id") ON DELETE CASCADE;


-- --------------------------------------------------------
-- 3. INDEXES
-- --------------------------------------------------------

CREATE INDEX "market_games_status_idx"      ON "public"."market_games" ("status");
CREATE INDEX "market_games_lang_idx"        ON "public"."market_games" ("lang");
CREATE INDEX "market_games_library_cnt_idx" ON "public"."market_games" ("library_count" DESC);
CREATE INDEX "market_games_author_idx"      ON "public"."market_games" ("author_user_id");
CREATE INDEX "uml_market_game_idx"          ON "public"."user_market_library" ("market_game_id");


-- --------------------------------------------------------
-- 4. TRIGGER — library_count cache
-- --------------------------------------------------------

CREATE FUNCTION "public"."trg_market_library_count"() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if tg_op = 'INSERT' then
        update public.market_games
           set library_count = library_count + 1,
               updated_at    = now()
         where id = new.market_game_id;
        return new;
    end if;

    if tg_op = 'DELETE' then
        update public.market_games
           set library_count = greatest(0, library_count - 1),
               updated_at    = now()
         where id = old.market_game_id;
        return old;
    end if;

    return null;
end;
$$;

CREATE TRIGGER "trg_uml_library_count"
    AFTER INSERT OR DELETE ON "public"."user_market_library"
    FOR EACH ROW EXECUTE FUNCTION "public"."trg_market_library_count"();


-- trigger updated_at na market_games
CREATE FUNCTION "public"."trg_touch_market_games_updated_at"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;

CREATE TRIGGER "trg_market_games_updated_at"
    BEFORE UPDATE ON "public"."market_games"
    FOR EACH ROW EXECUTE FUNCTION "public"."trg_touch_market_games_updated_at"();


-- --------------------------------------------------------
-- 5. RLS
-- --------------------------------------------------------

ALTER TABLE "public"."market_games" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_market_library" ENABLE ROW LEVEL SECURITY;

-- market_games SELECT:
--   published  → wszyscy (w tym anon — marketplace jest publiczny)
--   withdrawn  → autor LUB user który ma w bibliotece
--   pending / rejected → tylko autor
CREATE POLICY "mg_select" ON "public"."market_games"
    FOR SELECT
    USING (
        status = 'published'
        OR (
            status = 'withdrawn'
            AND (
                author_user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.user_market_library
                     WHERE market_game_id = id
                       AND user_id = auth.uid()
                )
            )
        )
        OR (
            status IN ('pending', 'rejected')
            AND author_user_id = auth.uid()
        )
    );

-- market_games INSERT: tylko zalogowany, tylko własne (backup — właściwe przez RPC)
CREATE POLICY "mg_insert_own" ON "public"."market_games"
    FOR INSERT TO "authenticated"
    WITH CHECK (author_user_id = auth.uid());

-- market_games UPDATE/DELETE: zablokowane bezpośrednio — tylko przez SECURITY DEFINER RPC
CREATE POLICY "mg_no_direct_update" ON "public"."market_games"
    FOR UPDATE USING (false);

CREATE POLICY "mg_no_direct_delete" ON "public"."market_games"
    FOR DELETE USING (false);

-- user_market_library: user zarządza tylko swoimi wierszami
CREATE POLICY "uml_own" ON "public"."user_market_library"
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- --------------------------------------------------------
-- 6. RPC — user-facing
-- --------------------------------------------------------

-- 6a. Browse: lista published z priorytetem językowym i popularnością
CREATE FUNCTION "public"."market_browse"(
    "p_lang"   text    DEFAULT 'pl',
    "p_search" text    DEFAULT '',
    "p_limit"  integer DEFAULT 20,
    "p_offset" integer DEFAULT 0
)
RETURNS TABLE(
    "id"            uuid,
    "title"         text,
    "description"   text,
    "lang"          text,
    "library_count" integer,
    "author_username" text,
    "created_at"    timestamptz,
    "in_library"    boolean
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id,
        mg.title,
        mg.description,
        mg.lang,
        mg.library_count,
        COALESCE(pr.username, '') AS author_username,
        mg.created_at,
        CASE
            WHEN auth.uid() IS NULL THEN false
            ELSE EXISTS (
                SELECT 1 FROM public.user_market_library uml
                 WHERE uml.market_game_id = mg.id
                   AND uml.user_id = auth.uid()
            )
        END AS in_library
    FROM public.market_games mg
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE mg.status = 'published'
      AND (
          p_search = ''
          OR mg.title ILIKE '%' || p_search || '%'
          OR mg.description ILIKE '%' || p_search || '%'
      )
    ORDER BY
        (mg.lang = p_lang) DESC,
        mg.library_count DESC,
        mg.created_at DESC
    LIMIT  LEAST(p_limit, 100)
    OFFSET p_offset;
$$;


-- 6b. Szczegół jednej gry (payload + in_library)
CREATE FUNCTION "public"."market_game_detail"("p_id" uuid)
RETURNS TABLE(
    "id"              uuid,
    "title"           text,
    "description"     text,
    "lang"            text,
    "library_count"   integer,
    "author_username" text,
    "status"          public.market_game_status,
    "payload"         jsonb,
    "in_library"      boolean
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id,
        mg.title,
        mg.description,
        mg.lang,
        mg.library_count,
        COALESCE(pr.username, '') AS author_username,
        mg.status,
        mg.payload,
        CASE
            WHEN auth.uid() IS NULL THEN false
            ELSE EXISTS (
                SELECT 1 FROM public.user_market_library uml
                 WHERE uml.market_game_id = mg.id
                   AND uml.user_id = auth.uid()
            )
        END AS in_library
    FROM public.market_games mg
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE mg.id = p_id;
$$;


-- 6c. Moje wysłane (twórca widzi swoje zgłoszenia)
CREATE FUNCTION "public"."market_my_submissions"()
RETURNS TABLE(
    "id"               uuid,
    "source_game_id"   uuid,
    "title"            text,
    "description"      text,
    "lang"             text,
    "status"           public.market_game_status,
    "moderation_note"  text,
    "library_count"    integer,
    "created_at"       timestamptz
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id,
        mg.source_game_id,
        mg.title,
        mg.description,
        mg.lang,
        mg.status,
        mg.moderation_note,
        mg.library_count,
        mg.created_at
    FROM public.market_games mg
    WHERE mg.author_user_id = auth.uid()
      AND mg.status <> 'withdrawn'
    ORDER BY mg.created_at DESC;
$$;


-- 6d. Wyślij grę do marketplace (snapshot tworzony po stronie klienta)
CREATE FUNCTION "public"."market_submit_game"(
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
    v_uid  uuid := auth.uid();
    v_game public.games;
    v_new  uuid;
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

    -- gra musi być typu prepared LUB zamkniętym sondażem (status=ready + type!=prepared)
    if not (
        v_game.type = 'prepared'
        or (v_game.type <> 'prepared' and v_game.status = 'ready')
    ) then
        return query select false, 'game_not_eligible', null::uuid;
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

    insert into public.market_games
        (source_game_id, author_user_id, title, description, lang, payload, status)
    values
        (p_game_id, v_uid, btrim(p_title), btrim(coalesce(p_description, '')), p_lang, p_payload, 'pending')
    returning id into v_new;

    return query select true, '', v_new;
end;
$$;


-- 6e. Wycofaj grę z marketplace
CREATE FUNCTION "public"."market_withdraw"("p_market_game_id" uuid)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_uid uuid := auth.uid();
    v_rows int;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    update public.market_games
       set status = 'withdrawn'
     where id = p_market_game_id
       and author_user_id = v_uid
       and status = 'published';

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found_or_not_published';
        return;
    end if;

    return query select true, '';
end;
$$;


-- 6f. Dodaj do biblioteki
CREATE FUNCTION "public"."market_add_to_library"("p_market_game_id" uuid)
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

    -- gra musi być published lub withdrawn (ale withdrawn zostaje w bibliotece)
    if not exists (
        select 1 from public.market_games
         where id = p_market_game_id
           and status in ('published', 'withdrawn')
    ) then
        return query select false, 'game_not_available';
        return;
    end if;

    insert into public.user_market_library (user_id, market_game_id)
    values (v_uid, p_market_game_id)
    on conflict do nothing;

    return query select true, '';
end;
$$;


-- 6g. Usuń z biblioteki
CREATE FUNCTION "public"."market_remove_from_library"("p_market_game_id" uuid)
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
     where user_id = v_uid
       and market_game_id = p_market_game_id;

    return query select true, '';
end;
$$;


-- 6h. Moje gry z biblioteki (dla Buildera — zakładka "Z marketu")
CREATE FUNCTION "public"."market_my_library"()
RETURNS TABLE(
    "market_game_id"  uuid,
    "title"           text,
    "lang"            text,
    "author_username" text,
    "status"          public.market_game_status,
    "payload"         jsonb,
    "added_at"        timestamptz
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id            AS market_game_id,
        mg.title,
        mg.lang,
        COALESCE(pr.username, '') AS author_username,
        mg.status,
        mg.payload,
        uml.created_at   AS added_at
    FROM public.user_market_library uml
    JOIN public.market_games mg   ON mg.id = uml.market_game_id
    LEFT JOIN public.profiles pr  ON pr.id = mg.author_user_id
    WHERE uml.user_id = auth.uid()
    ORDER BY uml.created_at DESC;
$$;


-- --------------------------------------------------------
-- 7. RPC — admin (SECURITY DEFINER, wywoływane przez Cloudflare Worker
--    z service_role key — nie przez zwykłego użytkownika)
-- --------------------------------------------------------

-- 7a. Lista zgłoszeń wg statusu
CREATE FUNCTION "public"."market_admin_list"("p_status" text DEFAULT 'pending')
RETURNS TABLE(
    "id"              uuid,
    "title"           text,
    "description"     text,
    "lang"            text,
    "status"          public.market_game_status,
    "moderation_note" text,
    "library_count"   integer,
    "author_username" text,
    "author_email"    text,
    "gh_slug"         text,
    "created_at"      timestamptz
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id,
        mg.title,
        mg.description,
        mg.lang,
        mg.status,
        mg.moderation_note,
        mg.library_count,
        COALESCE(pr.username, '') AS author_username,
        COALESCE(pr.email, '')    AS author_email,
        mg.gh_slug,
        mg.created_at
    FROM public.market_games mg
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE mg.status = p_status::public.market_game_status
    ORDER BY mg.created_at ASC;
$$;


-- 7b. Podgląd pełny (z payloadem) dla admina
CREATE FUNCTION "public"."market_admin_detail"("p_id" uuid)
RETURNS TABLE(
    "id"              uuid,
    "title"           text,
    "description"     text,
    "lang"            text,
    "status"          public.market_game_status,
    "moderation_note" text,
    "library_count"   integer,
    "author_username" text,
    "author_email"    text,
    "gh_slug"         text,
    "payload"         jsonb,
    "created_at"      timestamptz
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        mg.id,
        mg.title,
        mg.description,
        mg.lang,
        mg.status,
        mg.moderation_note,
        mg.library_count,
        COALESCE(pr.username, '') AS author_username,
        COALESCE(pr.email, '')    AS author_email,
        mg.gh_slug,
        mg.payload,
        mg.created_at
    FROM public.market_games mg
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE mg.id = p_id;
$$;


-- 7c. Zatwierdź lub odrzuć zgłoszenie
CREATE FUNCTION "public"."market_admin_review"(
    "p_id"     uuid,
    "p_action" text,   -- 'approve' | 'reject'
    "p_note"   text DEFAULT ''
)
RETURNS TABLE("ok" boolean, "err" text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_new_status public.market_game_status;
begin
    if p_action = 'approve' then
        v_new_status := 'published';
    elsif p_action = 'reject' then
        v_new_status := 'rejected';
    else
        return query select false, 'invalid_action';
        return;
    end if;

    update public.market_games
       set status          = v_new_status,
           moderation_note = case when p_action = 'reject' then btrim(coalesce(p_note, '')) else null end
     where id = p_id
       and status = 'pending';

    if not found then
        return query select false, 'not_found_or_not_pending';
        return;
    end if;

    return query select true, '';
end;
$$;


-- 7d. Upsert gry producenta z GH (by gh_slug)
CREATE FUNCTION "public"."market_admin_upsert_gh"(
    "p_slug"    text,
    "p_title"   text,
    "p_description" text,
    "p_lang"    text,
    "p_payload" jsonb
)
RETURNS TABLE("ok" boolean, "err" text, "market_id" uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_id uuid;
begin
    if p_lang not in ('pl', 'en', 'uk') then
        return query select false, 'invalid_lang', null::uuid;
        return;
    end if;

    insert into public.market_games
        (gh_slug, author_user_id, source_game_id, title, description, lang, payload, status)
    values
        (p_slug, null, null, btrim(p_title), btrim(coalesce(p_description, '')), p_lang, p_payload, 'published')
    on conflict (gh_slug)
    do update set
        title       = excluded.title,
        description = excluded.description,
        lang        = excluded.lang,
        payload     = excluded.payload,
        status      = 'published',
        updated_at  = now()
    returning id into v_id;

    return query select true, '', v_id;
end;
$$;
