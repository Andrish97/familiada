DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_logos
     WHERE payload #> '{source,hostRasterUrl}' IS NOT NULL
        OR payload #> '{source,hostRasterData}' IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'DRAW Host raster references remain in user logos';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.demo_template_data
     WHERE payload #> '{payload,source,hostRasterUrl}' IS NOT NULL
        OR payload #> '{payload,source,hostRasterData}' IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'DRAW Host raster references remain in demo templates';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'user-logos' AND name LIKE '%-draw-host.png'
  ) THEN
    RAISE EXCEPTION 'DRAW Host PNG objects remain in Storage';
  END IF;
END
$$;

SELECT 'Production has no DRAW raster references or objects' AS result;
