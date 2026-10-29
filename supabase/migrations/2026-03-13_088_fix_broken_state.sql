-- 088: Fix broken state from failed migrations 086 and 087
-- This migration ensures that everything skipped due to SQL errors in 086/087 is correctly applied.

-- ============================================================================
-- 1. Fix Storage Index (Failed in 087 due to syntax error)
-- ============================================================================

DROP INDEX IF EXISTS community_games_bucket_folder_idx;

-- Use double parentheses for expression index
CREATE INDEX IF NOT EXISTS community_games_bucket_folder_idx
  ON storage.objects USING btree (bucket_id, ((storage.foldername(name))[1]))
  WHERE bucket_id = 'community-games';

-- ============================================================================
-- 2. Game Generation Queue (Skipped in 087)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_gen_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lang text NOT NULL DEFAULT 'pl',
  topic text,
  total_games integer NOT NULL DEFAULT 1,
  already_used text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS game_gen_queue_pick_idx 
  ON public.game_gen_queue (status, created_at);

CREATE INDEX IF NOT EXISTS game_gen_queue_created_by_idx 
  ON public.game_gen_queue (created_by, created_at DESC);

-- Enable RLS
ALTER TABLE public.game_gen_queue ENABLE ROW LEVEL SECURITY;

-- Policies for queue
DO $$ BEGIN
  DROP POLICY IF EXISTS "game_gen_queue_select_own" ON public.game_gen_queue;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "game_gen_queue_select_own" 
  ON public.game_gen_queue FOR SELECT 
  TO authenticated 
  USING (created_by = auth.uid());

DO $$ BEGIN
  DROP POLICY IF EXISTS "game_gen_queue_insert_own" ON public.game_gen_queue;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "game_gen_queue_insert_own" 
  ON public.game_gen_queue FOR INSERT 
  TO authenticated 
  WITH CHECK (created_by = auth.uid());

DO $$ BEGIN
  DROP POLICY IF EXISTS "game_gen_queue_worker_all" ON public.game_gen_queue;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "game_gen_queue_worker_all" 
  ON public.game_gen_queue FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- ============================================================================
-- 3. Market Games Schema (Skipped in 087)
-- ============================================================================

-- Ensure storage_path exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_games' AND column_name = 'storage_path') THEN
    ALTER TABLE public.market_games ADD COLUMN storage_path text;
  END IF;
END $$;

-- Migrate data from gh_slug if needed (if 086 column drop didn't run)
UPDATE public.market_games 
SET storage_path = 'admin/' || lang || '/' || gh_slug || '.json'
WHERE storage_path IS NULL AND gh_slug IS NOT NULL;

-- Remove gh_slug
ALTER TABLE public.market_games DROP COLUMN IF EXISTS gh_slug;

-- Index
CREATE INDEX IF NOT EXISTS market_games_storage_path_idx 
  ON public.market_games (storage_path);

-- ============================================================================
-- 4. RPC Functions (Failed in 086/087 due to return type changes)
-- ============================================================================

-- Drop functions first to avoid "cannot change return type" error
DROP FUNCTION IF EXISTS public.market_admin_list(text);
DROP FUNCTION IF EXISTS public.market_admin_detail(uuid);
DROP FUNCTION IF EXISTS public.market_admin_upsert(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.market_admin_upsert_gh(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.storage_list_objects(text, text, integer);

-- 4a. storage_list_objects
CREATE OR REPLACE FUNCTION public.storage_list_objects(
  p_bucket text,
  p_prefix text DEFAULT '',
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(
  name text,
  id uuid,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_accessed_at timestamptz,
  version text,
  size_bytes bigint,
  owner_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.name::text,
    o.id::uuid,
    o.metadata::jsonb,
    o.created_at::timestamptz,
    o.updated_at::timestamptz,
    o.last_accessed_at::timestamptz,
    o.version::text,
    COALESCE(NULLIF(o.metadata->>'size', ''), '0')::bigint as size_bytes,
    o.owner_id::uuid
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND (p_prefix = '' OR o.name LIKE (p_prefix || '%'))
  ORDER BY o.name
  LIMIT p_limit;
$$;

-- 4b. market_admin_upsert
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
    author_user_id
  ) values (
    p_storage_path,
    p_title,
    p_description,
    p_lang,
    p_payload,
    'published',
    auth.uid()
  )
  returning id into v_id;

  return query select true, ''::text, v_id, false;
end;
$$;

-- 4c. market_admin_list
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

-- 4d. market_admin_detail
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

COMMENT ON FUNCTION public.market_admin_upsert IS 'Upsertuje grę do market_games - nowe gry są automatycznie published';
COMMENT ON FUNCTION public.storage_list_objects IS 'Listuje obiekty w bucket Supabase Storage (RPC dla admina)';
