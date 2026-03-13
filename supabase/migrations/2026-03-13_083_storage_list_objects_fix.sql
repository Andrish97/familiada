-- 083: storage_list_objects - fix z explicit cast
DROP FUNCTION IF EXISTS public.storage_list_objects(text, text, integer);

CREATE FUNCTION public.storage_list_objects(
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
  owner uuid
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
    o.owner::uuid
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND (p_prefix = '' OR o.name LIKE (p_prefix || '%'))
  ORDER BY o.name
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.storage_list_objects IS 'Listuje obiekty w bucket Supabase Storage (RPC dla admina)';
