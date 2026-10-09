-- DRAW host artwork is rendered from the saved Fabric scene as SVG. Remove
-- legacy PNG references and queue every generated DRAW raster for Storage API
-- deletion. IMAGE uploads and their URLs are intentionally untouched.
BEGIN;

UPDATE public.user_logos
   SET payload = jsonb_set(payload, '{source}', (payload->'source') - 'hostRasterUrl' - 'hostRasterData')
 WHERE jsonb_typeof(payload->'source') = 'object'
   AND ((payload->'source') ? 'hostRasterUrl' OR (payload->'source') ? 'hostRasterData');

UPDATE public.demo_template_data
   SET payload = jsonb_set(payload, '{payload,source}', (payload #> '{payload,source}') - 'hostRasterUrl' - 'hostRasterData')
 WHERE slot = 'logo_draw'
   AND jsonb_typeof(payload #> '{payload,source}') = 'object'
   AND ((payload #> '{payload,source}') ? 'hostRasterUrl' OR (payload #> '{payload,source}') ? 'hostRasterData');

-- Queue all generated DRAW files, including files left by old or edited logos.
-- Storage objects must be removed through the Storage API, never by deleting
-- rows from storage.objects directly. A random owner id lets the normal claim
-- function verify the paths are no longer referenced before deletion.
INSERT INTO public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
SELECT 'user-logos', o.name, false, 'logo', gen_random_uuid()
  FROM storage.objects o
 WHERE o.bucket_id = 'user-logos'
   AND o.name LIKE '%-draw-host.png'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._storage_cleanup_on_logo_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_path text;
BEGIN
  v_path := public._logo_url_path(old.payload #>> '{source,imageUrl}', old.user_id);
  IF v_path IS NOT NULL THEN
    INSERT INTO public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
    VALUES ('user-logos', v_path, false, 'logo', old.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN old;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_cleanup_claim(p_limit integer DEFAULT 100)
RETURNS TABLE(id bigint, bucket text, path text, is_folder boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.storage_cleanup_queue q
   WHERE (q.owner_kind = 'game' AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = q.owner_id))
      OR (q.owner_kind = 'user' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = q.owner_id))
      OR (q.owner_kind = 'logo' AND EXISTS (
            SELECT 1 FROM public.user_logos l
             WHERE l.id = q.owner_id
                OR public._logo_url_path(l.payload #>> '{source,imageUrl}', l.user_id) = q.path));

  RETURN QUERY
  UPDATE public.storage_cleanup_queue q
     SET claimed_at = now(), attempts = q.attempts + 1
   WHERE q.id IN (
     SELECT q2.id FROM public.storage_cleanup_queue q2
      WHERE q2.attempts < 20
        AND (q2.claimed_at IS NULL OR q2.claimed_at < now() - interval '5 minutes')
      ORDER BY q2.id
      LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.id, q.bucket, q.path, q.is_folder;
END;
$$;

DROP FUNCTION IF EXISTS public._logo_host_raster_path(jsonb, uuid);
REVOKE ALL ON FUNCTION public.storage_cleanup_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_cleanup_claim(integer) TO service_role;

SELECT public.storage_cleanup_kick();
COMMIT;
