DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_game_origin') THEN
    CREATE TYPE public.market_game_origin AS ENUM ('community', 'producer');
  END IF;
END $$;

ALTER TABLE public.market_games
  ADD COLUMN IF NOT EXISTS origin public.market_game_origin NOT NULL DEFAULT 'community';

UPDATE public.market_games
   SET origin = 'producer'
 WHERE status = 'published'
   AND source_game_id IS NULL;

DROP FUNCTION IF EXISTS public.market_browse(text, text, integer, integer);
CREATE FUNCTION public.market_browse(
  p_lang   text    DEFAULT 'pl',
  p_search text    DEFAULT '',
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  author_username text,
  created_at      timestamptz,
  in_library      boolean,
  origin          text
)
LANGUAGE sql
STABLE
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
    END AS in_library,
    mg.origin::text AS origin
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

DROP FUNCTION IF EXISTS public.market_game_detail(uuid);
CREATE FUNCTION public.market_game_detail(p_id uuid)
RETURNS TABLE(
  id              uuid,
  title           text,
  description     text,
  lang            text,
  library_count   integer,
  author_username text,
  status          public.market_game_status,
  payload         jsonb,
  in_library      boolean,
  origin          text
)
LANGUAGE sql
STABLE
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
    END AS in_library,
    mg.origin::text AS origin
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.market_admin_upsert(
  p_storage_path text,
  p_title text,
  p_description text,
  p_lang text,
  p_payload jsonb
)
RETURNS TABLE(ok boolean, err text, market_id uuid, existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_id uuid;
  v_existing uuid;
begin
  if p_storage_path is null or p_storage_path = '' then
    return query select false, 'storage_path_required'::text, null::uuid, false;
    return;
  end if;

  if p_payload is null then
    return query select false, 'payload_required'::text, null::uuid, false;
    return;
  end if;

  select id into v_existing
    from public.market_games
   where storage_path = p_storage_path;

  if v_existing is not null then
    update public.market_games
       set title = p_title,
           description = p_description,
           lang = p_lang,
           payload = p_payload,
           origin = 'producer',
           updated_at = now()
     where id = v_existing;

    return query select true, ''::text, v_existing, true;
    return;
  end if;

  insert into public.market_games (
    storage_path,
    title,
    description,
    lang,
    payload,
    status,
    author_user_id,
    origin
  ) values (
    p_storage_path,
    p_title,
    p_description,
    p_lang,
    p_payload,
    'published',
    auth.uid(),
    'producer'
  )
  returning id into v_id;

  return query select true, ''::text, v_id, false;
end;
$$;

CREATE OR REPLACE FUNCTION public.market_admin_review(
  p_id uuid,
  p_action text,
  p_note text DEFAULT ''
)
RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql
SECURITY DEFINER
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
         origin          = case when p_action = 'approve' then 'community' else origin end,
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
