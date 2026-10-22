-- 430: Menedżer bazy — cała zawartość bazy jednym zapytaniem (E22, etap 8a).
-- Dotąd strona pobierała 4 tabele stronami po 1000 wierszy, jedna strona po
-- drugiej (przypisania tagów przez złączenie z rosnącym OFFSET): baza z
-- 20 000 pytań wczytywała się ~13 s. Funkcja zwraca jeden jsonb:
-- {categories:[…], tags:[…], questions:[…], questionTags:[…]}.
-- Dostęp: jedno jawne sprawdzenie base_can_access (to samo, którego używają
-- polityki RLS tych tabel) na początku, potem SECURITY DEFINER bez RLS —
-- polityki liczone dla każdego wiersza kosztowały ~1 s przy 20 000 pytań.
-- Czytelnik widzi, obcy dostaje puste listy (jak przy RLS). Tylko dodaje funkcje.
-- qb_question_tag_links: przypisania tagów wskazanych pytań (okno tagów;
-- lista id w treści zapytania, nie w adresie — bez limitu długości adresu
-- i 1000 wierszy).

CREATE OR REPLACE FUNCTION public.qb_base_content(p_base_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.base_can_access(p_base_id, auth.uid()) THEN
    RETURN '{"categories":[],"tags":[],"questions":[],"questionTags":[]}'::jsonb;
  END IF;
  RETURN jsonb_build_object(
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
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_question_tag_links(p_base_id uuid, p_question_ids uuid[]) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.base_can_access(p_base_id, auth.uid()) THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('question_id', l.question_id, 'tag_id', l.tag_id))
      FROM public.qb_question_tags l
      JOIN public.qb_questions q ON q.id = l.question_id
     WHERE q.base_id = p_base_id AND l.question_id = ANY(coalesce(p_question_ids, '{}'))), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.qb_base_content(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_question_tag_links(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qb_question_tag_links(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_base_content(uuid) TO authenticated;
