-- 492: marketing_import_contacts (491) można wołać kilka razy w jednej
-- transakcji (import po 1000 wierszy). Tabela robocza _imp z ON COMMIT DROP
-- istniała do końca transakcji i drugie wywołanie kończyło się błędem
-- „relation _imp already exists” (import 1309 kontaktów, 2026-10-25).
CREATE OR REPLACE FUNCTION public.marketing_import_contacts(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  n_upd int := 0;
  n_del int := 0;
  n_cat int := 0;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'marketing_import_contacts: oczekiwano tablicy do 1000 wierszy';
  END IF;

  DROP TABLE IF EXISTS pg_temp._imp;
  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  SELECT (r->>'id')::uuid AS id,
         lower(coalesce(r->>'decision', '')) AS decision,
         nullif(left(btrim(coalesce(r->>'name', '')), 200), '') AS name,
         nullif(left(btrim(coalesce(r->>'category', '')), 80), '') AS category
    FROM jsonb_array_elements(p_rows) r
   WHERE coalesce(r->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  DELETE FROM public.marketing_verified_contacts c USING _imp i WHERE c.id = i.id AND i.decision = 'delete';
  GET DIAGNOSTICS n_del = ROW_COUNT;

  INSERT INTO public.marketing_categories(name)
  SELECT DISTINCT ON (lower(i.category)) i.category FROM _imp i
   WHERE i.decision <> 'delete' AND i.category IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.marketing_categories k WHERE lower(btrim(k.name)) = lower(i.category))
  ORDER BY lower(i.category);
  GET DIAGNOSTICS n_cat = ROW_COUNT;

  UPDATE public.marketing_verified_contacts c
     SET title = coalesce(i.name, c.title),
         category_id = coalesce((SELECT k.id FROM public.marketing_categories k WHERE lower(btrim(k.name)) = lower(i.category)), c.category_id),
         quality = CASE WHEN i.decision = 'keep' THEN 'good' ELSE c.quality END,
         reviewed_at = CASE WHEN i.decision = 'keep' THEN now() ELSE c.reviewed_at END
    FROM _imp i
   WHERE c.id = i.id AND i.decision <> 'delete'
     AND (i.name IS NOT NULL OR i.category IS NOT NULL OR i.decision = 'keep');
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  DROP TABLE pg_temp._imp;
  RETURN jsonb_build_object('updated', n_upd, 'deleted', n_del, 'categories', n_cat);
END $$;

REVOKE ALL ON FUNCTION public.marketing_import_contacts(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_import_contacts(jsonb) TO service_role;
