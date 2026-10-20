-- 430: Menedżer bazy — cała zawartość bazy jednym zapytaniem (E22, etap 8a).
-- Dotąd strona pobierała 4 tabele stronami po 1000 wierszy, jedna strona po
-- drugiej (przypisania tagów przez złączenie z rosnącym OFFSET): baza z
-- 20 000 pytań wczytywała się ~13 s. Funkcja zwraca jeden jsonb:
-- {categories:[…], tags:[…], questions:[…], questionTags:[…]}.
-- SECURITY INVOKER: te same polityki RLS co przy zwykłych odczytach
-- (czytelnik widzi, obcy dostaje puste listy). Tylko dodaje funkcję.

CREATE OR REPLACE FUNCTION public.qb_base_content(p_base_id uuid) RETURNS jsonb
  LANGUAGE sql STABLE
  SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'categories', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'base_id', c.base_id, 'parent_id', c.parent_id, 'name', c.name,
                                          'ord', c.ord, 'created_at', c.created_at, 'updated_at', c.updated_at)
                       ORDER BY c.ord, c.id)
        FROM public.qb_categories c WHERE c.base_id = p_base_id), '[]'::jsonb),
    'tags', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'base_id', t.base_id, 'name', t.name, 'color', t.color, 'ord', t.ord)
                       ORDER BY t.ord, t.id)
        FROM public.qb_tags t WHERE t.base_id = p_base_id), '[]'::jsonb),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'base_id', q.base_id, 'category_id', q.category_id, 'ord', q.ord,
                                          'payload', q.payload, 'created_at', q.created_at, 'updated_at', q.updated_at)
                       ORDER BY q.ord, q.id)
        FROM public.qb_questions q WHERE q.base_id = p_base_id), '[]'::jsonb),
    'questionTags', coalesce((
      SELECT jsonb_agg(jsonb_build_object('question_id', l.question_id, 'tag_id', l.tag_id))
        FROM public.qb_question_tags l
        JOIN public.qb_questions q ON q.id = l.question_id
       WHERE q.base_id = p_base_id), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.qb_base_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qb_base_content(uuid) TO authenticated;
