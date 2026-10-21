-- 429: Menedżer bazy — cofanie usunięcia tagów (E22 etap 3).
-- Odtwarza tagi z tymi samymi id i ich przypisania ze zrzutu zwróconego
-- przez qb_delete_tags (427): {tags:[…], questionLinks:[…], folderLinks:[…]}.
-- Te same id = dalsze kroki historii cofania (np. ponowne nadanie tagu)
-- nadal wskazują właściwy tag. Tag, którego nazwa jest już zajęta w bazie
-- (ktoś w międzyczasie założył taki sam), kończy się qb:duplicate;
-- przypisania do pytań i folderów, których już nie ma, są pomijane.

CREATE OR REPLACE FUNCTION public.qb_restore_tags(p_base_id uuid, p_snapshot jsonb) RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_snapshot->'tags', '[]')) x
      JOIN public.qb_tags t ON t.base_id = p_base_id AND public._qb_tag_key(t.name) = public._qb_tag_key(x->>'name') AND t.id <> (x->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'qb:duplicate' USING errcode = 'P0001';
  END IF;

  INSERT INTO public.qb_tags (id, base_id, name, color, ord)
  SELECT (x->>'id')::uuid, p_base_id, x->>'name', coalesce(x->>'color', '#4da3ff'), coalesce((x->>'ord')::int, 9999)
    FROM jsonb_array_elements(coalesce(p_snapshot->'tags', '[]')) x
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.qb_question_tags (question_id, tag_id)
  SELECT DISTINCT (x->>'question_id')::uuid, (x->>'tag_id')::uuid
    FROM jsonb_array_elements(coalesce(p_snapshot->'questionLinks', '[]')) x
   WHERE EXISTS (SELECT 1 FROM public.qb_questions q WHERE q.id = (x->>'question_id')::uuid AND q.base_id = p_base_id)
     AND EXISTS (SELECT 1 FROM public.qb_tags t WHERE t.id = (x->>'tag_id')::uuid AND t.base_id = p_base_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.qb_category_tags (category_id, tag_id)
  SELECT DISTINCT (x->>'category_id')::uuid, (x->>'tag_id')::uuid
    FROM jsonb_array_elements(coalesce(p_snapshot->'folderLinks', '[]')) x
   WHERE EXISTS (SELECT 1 FROM public.qb_categories c WHERE c.id = (x->>'category_id')::uuid AND c.base_id = p_base_id)
     AND EXISTS (SELECT 1 FROM public.qb_tags t WHERE t.id = (x->>'tag_id')::uuid AND t.base_id = p_base_id)
     -- qb_category_tags nie ma klucza głównego: bez duplikatów ręcznie
     AND NOT EXISTS (SELECT 1 FROM public.qb_category_tags l
                      WHERE l.category_id = (x->>'category_id')::uuid AND l.tag_id = (x->>'tag_id')::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.qb_restore_tags(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qb_restore_tags(uuid, jsonb) TO authenticated;
