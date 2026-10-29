-- 081: naprawa market_admin funkcji - DROP przed CREATE
DROP FUNCTION IF EXISTS public.market_admin_list(text);
DROP FUNCTION IF EXISTS public.market_admin_detail(uuid);
DROP FUNCTION IF EXISTS public.market_admin_upsert(text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.market_admin_list(p_status text DEFAULT 'pending'::text)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  lang text,
  status public.market_game_status,
  moderation_note text,
  library_count integer,
  author_username text,
  author_email text,
  storage_path text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    COALESCE(pr.email, '') AS author_email,
    mg.storage_path,
    mg.created_at
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = p_status::public.market_game_status
  ORDER BY mg.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.market_admin_detail(p_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  lang text,
  status public.market_game_status,
  moderation_note text,
  library_count integer,
  author_username text,
  author_email text,
  storage_path text,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    COALESCE(pr.email, '') AS author_email,
    mg.storage_path,
    mg.payload,
    mg.created_at
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
RETURNS TABLE(ok boolean, err text, market_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_id uuid;
  v_existing uuid;
begin
  if p_storage_path is null or p_storage_path = '' then
    return query select false, 'storage_path_required'::text, null::uuid;
    return;
  end if;
  
  if p_payload is null then
    return query select false, 'payload_required'::text, null::uuid;
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
           status = 'pending',
           updated_at = now()
     where id = v_existing;
    
    return query select true, ''::text, v_existing;
    return;
  end if;
  
  insert into public.market_games (
    storage_path,
    title,
    description,
    lang,
    payload,
    status,
    author_user_id
  ) values (
    p_storage_path,
    p_title,
    p_description,
    p_lang,
    p_payload,
    'pending',
    auth.uid()
  )
  returning id into v_id;
  
  return query select true, ''::text, v_id;
end;
$$;

COMMENT ON FUNCTION public.market_admin_upsert IS 'Upsertuje grę do market_games';
