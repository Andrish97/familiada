-- 241: Drop legacy marketplace/community-games file-storage architecture
--
-- Market game payloads moved to the market_games.payload jsonb column long ago.
-- storage_path (pointing at JSON files in the marketplace/community-games
-- buckets) has not been written by any code path since — market_admin_list
-- already hardcoded NULL::text for it. The 2 remaining legacy rows are junk.
--
-- Buckets themselves are assumed already removed via the Storage
-- Dashboard/API (plain SQL DELETE does not purge underlying files, only
-- Dashboard/Storage API does). The DELETE FROM storage.buckets below is a
-- no-op if they're already gone, and would fail loudly on a FK violation
-- if objects still existed under them — it will not silently orphan files.

-- 1. Drop the legacy file-backed rows
DELETE FROM public.market_games WHERE storage_path IS NOT NULL;

-- 2. Drop the now-pointless sync function (kept DB rows in sync with a bucket nothing writes to)
DROP FUNCTION IF EXISTS public.market_admin_sync_cleanup(text[]);

-- 3. Simplify market_admin_delete: drop the storage_path "protected" branch
CREATE OR REPLACE FUNCTION public.market_admin_delete(p_id uuid, p_force boolean DEFAULT false)
RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
    v_rows int;
begin
    if not p_force and exists (
        select 1 from public.market_games where id = p_id and origin = 'producer'
    ) then
        return query select false, 'admin_game_cannot_be_deleted_without_force';
        return;
    end if;

    delete from public.market_games where id = p_id;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found';
        return;
    end if;

    return query select true, '';
end;
$$;

-- 4. market_admin_list: drop storage_path from the return shape (return type changes -> DROP+CREATE)
DROP FUNCTION IF EXISTS public.market_admin_list(text);
CREATE FUNCTION public.market_admin_list(p_status text DEFAULT 'pending'::text)
RETURNS TABLE(
  id uuid, title text, description text, lang text, status public.market_game_status,
  moderation_note text, library_count integer, author_username text, author_email text,
  created_at timestamptz, updated_at timestamptz, source_game_id uuid, origin text, slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.status, mg.moderation_note, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '')    AS author_email,
    mg.created_at, mg.updated_at, mg.source_game_id,
    mg.origin::text AS origin, mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = p_status::public.market_game_status
  ORDER BY mg.created_at ASC;
$$;

-- 5. Drop the now-unused column (its index goes automatically with it)
ALTER TABLE public.market_games DROP COLUMN IF EXISTS storage_path;

-- 6. Drop RLS policies for the two dead buckets
DROP POLICY IF EXISTS "marketplace-select" ON storage.objects;
DROP POLICY IF EXISTS "marketplace-insert" ON storage.objects;
DROP POLICY IF EXISTS "marketplace-update" ON storage.objects;
DROP POLICY IF EXISTS "marketplace-delete" ON storage.objects;
DROP POLICY IF EXISTS "community-games-select" ON storage.objects;
DROP POLICY IF EXISTS "community-games-insert" ON storage.objects;
DROP POLICY IF EXISTS "community-games-update" ON storage.objects;
DROP POLICY IF EXISTS "community-games-delete" ON storage.objects;
DROP POLICY IF EXISTS "community-games-admin-all" ON storage.objects;

-- 7. Drop the folder indexes
DROP INDEX IF EXISTS marketplace_bucket_folder_idx;
DROP INDEX IF EXISTS community_games_bucket_folder_idx;

-- 8. Drop the bucket rows themselves (no-op if already removed via Dashboard)
DELETE FROM storage.buckets WHERE id IN ('marketplace', 'community-games');
