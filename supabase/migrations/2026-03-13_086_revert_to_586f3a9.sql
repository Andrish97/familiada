-- Revert changes from migrations 076-083 to restore state compatible with commit 586f3a9

-- 1. Revert 083 (storage_list_objects)
DROP FUNCTION IF EXISTS public.storage_list_objects(text, text, integer);

-- 2. Revert 081 (market_admin functions)
DROP FUNCTION IF EXISTS public.market_admin_upsert(text, text, text, text, jsonb);

-- Restore market_admin_list from 044
CREATE OR REPLACE FUNCTION "public"."market_admin_list"("p_status" text DEFAULT 'pending'::text)
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

-- Restore market_admin_detail from 044
CREATE OR REPLACE FUNCTION "public"."market_admin_detail"("p_id" uuid)
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

-- 3. Revert 077 (storage_path -> gh_slug)
-- Add gh_slug back
ALTER TABLE public.market_games ADD COLUMN IF NOT EXISTS gh_slug text UNIQUE;

-- Try to restore gh_slug from storage_path
UPDATE public.market_games 
SET gh_slug = substring(storage_path from 'github/(.*)\.json') 
WHERE storage_path LIKE 'github/%.json' AND gh_slug IS NULL;

-- Drop storage_path
ALTER TABLE public.market_games DROP COLUMN IF EXISTS storage_path;

-- Restore market_admin_upsert_gh from 044 (depends on gh_slug)
-- Note: This function might still exist but be broken due to missing column.
-- Redefining it ensures it works.
CREATE OR REPLACE FUNCTION "public"."market_admin_upsert_gh"(
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
