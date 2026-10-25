-- 491: Lead Finder 3 — import przejrzanych kontaktów (CSV z panelu) i lista
-- kategorii z liczbą kontaktów. Tylko service_role (Worker, panel admina).

-- p_rows: [{id, decision: keep|delete|"", name?, category?}], najwyżej 1000.
-- delete -> kontakt usunięty; name -> nowa nazwa; category -> kategoria
-- (brakująca tworzona po nazwie, porównanie bez wielkości liter i spacji
-- na brzegach). Zwraca {updated, deleted, categories}.
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

  RETURN jsonb_build_object('updated', n_upd, 'deleted', n_del, 'categories', n_cat);
END $$;

-- Kategorie z liczbą kontaktów (zakładki tabeli w panelu).
CREATE OR REPLACE FUNCTION public.marketing_categories_list()
RETURNS TABLE (id uuid, name text, is_active boolean, description text, queries text[], pkd text[],
               expanded_at timestamptz, created_at timestamptz, contacts int)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT k.id, k.name, k.is_active, k.description, k.queries, k.pkd, k.expanded_at, k.created_at,
         (SELECT count(*)::int FROM public.marketing_verified_contacts c WHERE c.category_id = k.id)
    FROM public.marketing_categories k
   ORDER BY k.created_at, k.name;
$$;

REVOKE ALL ON FUNCTION public.marketing_import_contacts(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_categories_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_import_contacts(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_categories_list() TO service_role;
