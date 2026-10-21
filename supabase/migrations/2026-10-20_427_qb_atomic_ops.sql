-- 427: Menedżer bazy — atomowe operacje zapisu (porządkowanie, etap 1).
-- Każda akcja menedżera bazy (utwórz, zmień nazwę, zapisz pytanie, usuń,
-- przenieś, zmień kolejność, kopiuj, tagi) była dotąd kilkoma osobnymi
-- zapisami z przeglądarki; przerwanie w połowie zostawiało stan częściowy.
-- Tu każda akcja to jedna funkcja = jedna transakcja. SECURITY INVOKER:
-- działają zasady RLS i wyzwalacz treści pytań jak przy zapisie z klienta.
-- Funkcje zwracają stan „przed” zmianą (pod przyszłe cofanie, etap 3).
-- Tylko dodaje funkcje; stary kod klienta działa bez zmian.
--
-- Błędy (P0001): qb:not_authenticated, qb:forbidden, qb:gone (element
-- zniknął / spoza bazy), qb:cycle (folder do własnego poddrzewa),
-- qb:invalid (pusta lub zła wartość), qb:duplicate (nazwa tagu).

CREATE OR REPLACE FUNCTION public._qb_assert_edit(p_base_id uuid) RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'qb:not_authenticated' USING errcode = 'P0001';
  END IF;
  IF p_base_id IS NULL OR NOT public.base_can_edit(p_base_id, auth.uid()) THEN
    RAISE EXCEPTION 'qb:forbidden' USING errcode = 'P0001';
  END IF;
END;
$$;

-- Poddrzewo folderów (same foldery wejściowe też), tylko w danej bazie.
CREATE OR REPLACE FUNCTION public._qb_folder_subtree(p_base_id uuid, p_folder_ids uuid[]) RETURNS TABLE(id uuid)
  LANGUAGE sql STABLE
  SET search_path TO 'public'
AS $$
  WITH RECURSIVE t AS (
    SELECT c.id FROM public.qb_categories c
    WHERE c.base_id = p_base_id AND c.id = ANY(coalesce(p_folder_ids, '{}'))
    UNION
    SELECT c.id FROM public.qb_categories c JOIN t ON c.parent_id = t.id
    WHERE c.base_id = p_base_id
  )
  SELECT t.id FROM t;
$$;

-- Wszystkie podane id muszą istnieć w bazie; inaczej qb:gone.
CREATE OR REPLACE FUNCTION public._qb_assert_items(p_base_id uuid, p_question_ids uuid[], p_folder_ids uuid[]) RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT count(DISTINCT x) FROM unnest(coalesce(p_question_ids, '{}')) x)
     <> (SELECT count(*) FROM public.qb_questions q WHERE q.base_id = p_base_id AND q.id = ANY(coalesce(p_question_ids, '{}'))) THEN
    RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(coalesce(p_folder_ids, '{}')) x)
     <> (SELECT count(*) FROM public.qb_categories c WHERE c.base_id = p_base_id AND c.id = ANY(coalesce(p_folder_ids, '{}'))) THEN
    RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._qb_assert_folder(p_base_id uuid, p_folder_id uuid) RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public'
AS $$
BEGIN
  IF p_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.qb_categories WHERE id = p_folder_id AND base_id = p_base_id
  ) THEN
    RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001';
  END IF;
END;
$$;

-- ===== Tworzenie =====

CREATE OR REPLACE FUNCTION public.qb_create_folder(p_base_id uuid, p_parent_id uuid, p_name text) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_id uuid;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_folder(p_base_id, p_parent_id);
  IF v_name = '' THEN RAISE EXCEPTION 'qb:invalid' USING errcode = 'P0001'; END IF;

  INSERT INTO public.qb_categories (base_id, parent_id, name, ord)
  VALUES (p_base_id, p_parent_id, v_name,
    (SELECT coalesce(max(ord), 0) + 1 FROM public.qb_categories
      WHERE base_id = p_base_id AND parent_id IS NOT DISTINCT FROM p_parent_id))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_create_question(p_base_id uuid, p_category_id uuid, p_payload jsonb) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_folder(p_base_id, p_category_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'qb:invalid' USING errcode = 'P0001';
  END IF;

  INSERT INTO public.qb_questions (base_id, category_id, ord, payload, updated_by)
  VALUES (p_base_id, p_category_id,
    (SELECT coalesce(max(ord), 0) + 1 FROM public.qb_questions
      WHERE base_id = p_base_id AND category_id IS NOT DISTINCT FROM p_category_id),
    p_payload, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ===== Zmiany jednego elementu =====

-- Zwraca poprzednią nazwę.
CREATE OR REPLACE FUNCTION public.qb_rename_folder(p_base_id uuid, p_id uuid, p_name text) RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_old text;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  IF v_name = '' THEN RAISE EXCEPTION 'qb:invalid' USING errcode = 'P0001'; END IF;
  SELECT name INTO v_old FROM public.qb_categories WHERE id = p_id AND base_id = p_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001'; END IF;
  UPDATE public.qb_categories SET name = v_name WHERE id = p_id;
  RETURN v_old;
END;
$$;

-- Treść pytania (F2): podmienia tylko payload.text, odpowiedzi zostają
-- (bez wyścigu „odczyt payloadu → zapis całego”). Zwraca poprzedni tekst.
CREATE OR REPLACE FUNCTION public.qb_set_question_text(p_base_id uuid, p_id uuid, p_text text) RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_text text := btrim(coalesce(p_text, ''));
  v_old text;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  IF v_text = '' THEN RAISE EXCEPTION 'qb:invalid' USING errcode = 'P0001'; END IF;
  SELECT coalesce(payload->>'text', '') INTO v_old FROM public.qb_questions
    WHERE id = p_id AND base_id = p_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001'; END IF;
  UPDATE public.qb_questions
     SET payload = jsonb_set(CASE WHEN jsonb_typeof(payload) = 'object' THEN payload ELSE '{}'::jsonb END,
                             '{text}', to_jsonb(v_text)),
         updated_by = auth.uid()
   WHERE id = p_id;
  RETURN v_old;
END;
$$;

-- Cały payload (okno pytania). Zwraca poprzedni payload.
CREATE OR REPLACE FUNCTION public.qb_save_question(p_base_id uuid, p_id uuid, p_payload jsonb) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_old jsonb;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'qb:invalid' USING errcode = 'P0001';
  END IF;
  SELECT payload INTO v_old FROM public.qb_questions WHERE id = p_id AND base_id = p_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001'; END IF;
  UPDATE public.qb_questions SET payload = p_payload, updated_by = auth.uid() WHERE id = p_id;
  RETURN v_old;
END;
$$;

-- ===== Usuwanie =====

-- Usuwa pytania oraz foldery z całym poddrzewem (podfoldery i ich pytania;
-- qb_questions.category_id ma ON DELETE SET NULL, więc pytania trzeba
-- skasować jawnie). Zwraca liczby usuniętych elementów.
CREATE OR REPLACE FUNCTION public.qb_delete_items(p_base_id uuid, p_question_ids uuid[], p_folder_ids uuid[]) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_folders uuid[];
  v_q int;
  v_c int;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_items(p_base_id, p_question_ids, p_folder_ids);

  SELECT coalesce(array_agg(id), '{}') INTO v_folders FROM public._qb_folder_subtree(p_base_id, p_folder_ids);

  DELETE FROM public.qb_questions
   WHERE base_id = p_base_id
     AND (id = ANY(coalesce(p_question_ids, '{}')) OR category_id = ANY(v_folders));
  GET DIAGNOSTICS v_q = ROW_COUNT;

  DELETE FROM public.qb_categories WHERE base_id = p_base_id AND id = ANY(v_folders);
  GET DIAGNOSTICS v_c = ROW_COUNT;

  RETURN jsonb_build_object('questions', v_q, 'folders', v_c);
END;
$$;

-- ===== Przenoszenie i kolejność =====

CREATE OR REPLACE FUNCTION public._qb_assert_no_cycle(p_base_id uuid, p_folder_ids uuid[], p_target uuid) RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public'
AS $$
BEGIN
  IF p_target IS NOT NULL AND EXISTS (
    SELECT 1 FROM public._qb_folder_subtree(p_base_id, p_folder_ids) s WHERE s.id = p_target
  ) THEN
    RAISE EXCEPTION 'qb:cycle' USING errcode = 'P0001';
  END IF;
END;
$$;

-- Przenosi pytania i foldery do p_target (NULL = korzeń); kolejność (ord)
-- bez zmian, jak dotąd. Zwraca poprzednie miejsca:
-- {questions:[{id,category_id,ord}], folders:[{id,parent_id,ord}]}.
CREATE OR REPLACE FUNCTION public.qb_move_items(p_base_id uuid, p_question_ids uuid[], p_folder_ids uuid[], p_target uuid) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_items(p_base_id, p_question_ids, p_folder_ids);
  PERFORM public._qb_assert_folder(p_base_id, p_target);
  PERFORM public._qb_assert_no_cycle(p_base_id, p_folder_ids, p_target);

  SELECT jsonb_build_object(
    'questions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'category_id', category_id, 'ord', ord))
       FROM public.qb_questions WHERE base_id = p_base_id AND id = ANY(coalesce(p_question_ids, '{}'))), '[]'),
    'folders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'ord', ord))
       FROM public.qb_categories WHERE base_id = p_base_id AND id = ANY(coalesce(p_folder_ids, '{}'))), '[]')
  ) INTO v_before;

  UPDATE public.qb_questions SET category_id = p_target, updated_by = auth.uid()
   WHERE base_id = p_base_id AND id = ANY(coalesce(p_question_ids, '{}'));
  UPDATE public.qb_categories SET parent_id = p_target
   WHERE base_id = p_base_id AND id = ANY(coalesce(p_folder_ids, '{}'));

  RETURN v_before;
END;
$$;

-- Ustawia folderom z listy rodzica p_parent_id i kolejność 1..N (także
-- przeniesienie przez upuszczenie przed/za folderem). Zwraca poprzednie
-- miejsca jak qb_move_items (pole folders).
CREATE OR REPLACE FUNCTION public.qb_reorder_folders(p_base_id uuid, p_parent_id uuid, p_ordered_ids uuid[]) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_items(p_base_id, NULL, p_ordered_ids);
  PERFORM public._qb_assert_folder(p_base_id, p_parent_id);
  PERFORM public._qb_assert_no_cycle(p_base_id, p_ordered_ids, p_parent_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'ord', ord)), '[]')
    INTO v_before
    FROM public.qb_categories WHERE base_id = p_base_id AND id = ANY(p_ordered_ids);

  UPDATE public.qb_categories c SET parent_id = p_parent_id, ord = x.n
    FROM unnest(p_ordered_ids) WITH ORDINALITY x(id, n)
   WHERE c.id = x.id AND c.base_id = p_base_id;

  RETURN jsonb_build_object('folders', v_before);
END;
$$;

-- Przywraca miejsca zapisane przez qb_move_items / qb_reorder_folders
-- (cofanie). Elementy, których już nie ma, są pomijane; rodzic, którego
-- już nie ma, zamienia się na korzeń.
CREATE OR REPLACE FUNCTION public.qb_restore_positions(p_base_id uuid, p_positions jsonb) RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);

  UPDATE public.qb_categories c
     SET parent_id = CASE WHEN EXISTS (SELECT 1 FROM public.qb_categories p
                                        WHERE p.id = (x->>'parent_id')::uuid AND p.base_id = p_base_id)
                          THEN (x->>'parent_id')::uuid END,
         ord = coalesce((x->>'ord')::int, c.ord)
    FROM jsonb_array_elements(coalesce(p_positions->'folders', '[]')) x
   WHERE c.id = (x->>'id')::uuid AND c.base_id = p_base_id;

  UPDATE public.qb_questions q
     SET category_id = CASE WHEN EXISTS (SELECT 1 FROM public.qb_categories p
                                          WHERE p.id = (x->>'category_id')::uuid AND p.base_id = p_base_id)
                            THEN (x->>'category_id')::uuid END,
         ord = coalesce((x->>'ord')::int, q.ord),
         updated_by = auth.uid()
    FROM jsonb_array_elements(coalesce(p_positions->'questions', '[]')) x
   WHERE q.id = (x->>'id')::uuid AND q.base_id = p_base_id;

  -- przywrócone położenie nie może zrobić cyklu (ktoś mógł w międzyczasie
  -- przenieść rodzica do środka): taki folder ląduje w korzeniu
  UPDATE public.qb_categories c SET parent_id = NULL
   WHERE c.base_id = p_base_id
     AND c.id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(coalesce(p_positions->'folders', '[]')) x)
     AND c.parent_id IN (SELECT id FROM public._qb_folder_subtree(p_base_id, ARRAY[c.id]));
END;
$$;

-- ===== Kopiowanie =====

-- Wolna nazwa wśród rodzeństwa: „X”, „X (kopia)”, „X (kopia 2)”…
CREATE OR REPLACE FUNCTION public._qb_unique_folder_name(p_base_id uuid, p_parent_id uuid, p_name text) RETURNS text
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public'
AS $$
DECLARE
  v_base text := left(coalesce(nullif(btrim(p_name), ''), 'Folder'), 80);
  v_cand text := v_base;
  n int := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.qb_categories
                 WHERE base_id = p_base_id AND parent_id IS NOT DISTINCT FROM p_parent_id
                   AND lower(name) = lower(v_cand)) AND n < 10000 LOOP
    v_cand := left(v_base || CASE WHEN n = 1 THEN ' (kopia)' ELSE ' (kopia ' || n || ')' END, 80);
    n := n + 1;
  END LOOP;
  RETURN v_cand;
END;
$$;

-- Kopiuje pytania (w kolejności tablicy, na koniec folderu docelowego) i
-- foldery z całym poddrzewem, razem z tagami pytań.
-- Zwraca {questions:[nowe id pytań z p_question_ids], folders:[nowe id
-- folderów-korzeni kopii]}.
CREATE OR REPLACE FUNCTION public.qb_copy_items(p_base_id uuid, p_question_ids uuid[], p_folder_ids uuid[], p_target uuid) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_src uuid;
  v_fmap jsonb;   -- {stary_id_folderu: nowy_id}
  v_qmap jsonb;   -- [{old, new, cat, ord}]
  v_ord int;
  v_new_q jsonb := '[]';
  v_new_f jsonb := '[]';
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_items(p_base_id, p_question_ids, p_folder_ids);
  PERFORM public._qb_assert_folder(p_base_id, p_target);

  -- 1) foldery: każdy jako osobne drzewo w miejscu docelowym; nowe id
  -- z góry, więc całe poddrzewo wstawia jedno polecenie
  FOREACH v_src IN ARRAY coalesce(p_folder_ids, '{}') LOOP
    SELECT jsonb_object_agg(s.id::text, gen_random_uuid()) INTO v_fmap
      FROM public._qb_folder_subtree(p_base_id, ARRAY[v_src]) s;

    INSERT INTO public.qb_categories (id, base_id, parent_id, name, ord)
    SELECT (v_fmap->>c.id::text)::uuid, p_base_id,
      CASE WHEN c.id = v_src THEN p_target ELSE (v_fmap->>c.parent_id::text)::uuid END,
      CASE WHEN c.id = v_src THEN public._qb_unique_folder_name(p_base_id, p_target, c.name)
           ELSE left(coalesce(c.name, 'Folder'), 80) END,
      CASE WHEN c.id = v_src THEN (SELECT coalesce(max(x.ord), 0) + 1 FROM public.qb_categories x
                                    WHERE x.base_id = p_base_id AND x.parent_id IS NOT DISTINCT FROM p_target)
           ELSE c.ord END
      FROM public.qb_categories c
     WHERE c.base_id = p_base_id AND v_fmap ? c.id::text;

    SELECT coalesce(jsonb_agg(jsonb_build_object('old', q.id, 'new', gen_random_uuid(),
             'cat', v_fmap->>q.category_id::text, 'ord', q.ord)), '[]')
      INTO v_qmap
      FROM public.qb_questions q
     WHERE q.base_id = p_base_id AND v_fmap ? q.category_id::text;
    PERFORM public._qb_insert_question_copies(p_base_id, v_qmap);

    v_new_f := v_new_f || to_jsonb(v_fmap->>v_src::text);
  END LOOP;

  -- 2) pytania: kolejność tablicy, na koniec folderu docelowego
  SELECT coalesce(max(ord), 0) INTO v_ord FROM public.qb_questions
   WHERE base_id = p_base_id AND category_id IS NOT DISTINCT FROM p_target;
  SELECT coalesce(jsonb_agg(jsonb_build_object('old', x.id, 'new', gen_random_uuid(),
           'cat', p_target, 'ord', v_ord + x.n) ORDER BY x.n), '[]')
    INTO v_qmap
    FROM unnest(coalesce(p_question_ids, '{}')) WITH ORDINALITY x(id, n);
  PERFORM public._qb_insert_question_copies(p_base_id, v_qmap);
  SELECT coalesce(jsonb_agg(m->'new' ORDER BY (m->>'ord')::int), '[]') INTO v_new_q
    FROM jsonb_array_elements(v_qmap) m;

  RETURN jsonb_build_object('questions', v_new_q, 'folders', v_new_f);
END;
$$;

-- Wstawia kopie pytań według mapy [{old, new, cat, ord}] razem z tagami.
CREATE OR REPLACE FUNCTION public._qb_insert_question_copies(p_base_id uuid, p_map jsonb) RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.qb_questions (id, base_id, category_id, ord, payload, updated_by)
  SELECT (m->>'new')::uuid, p_base_id, (m->>'cat')::uuid, (m->>'ord')::int, q.payload, auth.uid()
    FROM jsonb_array_elements(coalesce(p_map, '[]')) m
    JOIN public.qb_questions q ON q.id = (m->>'old')::uuid AND q.base_id = p_base_id;

  INSERT INTO public.qb_question_tags (question_id, tag_id)
  SELECT (m->>'new')::uuid, l.tag_id
    FROM jsonb_array_elements(coalesce(p_map, '[]')) m
    JOIN public.qb_question_tags l ON l.question_id = (m->>'old')::uuid;
END;
$$;

-- ===== Tagi =====

-- Klucz nazwy tagu: bez wielkości liter i polskich znaków („Łatwe” = „latwe”)
-- — tak porównuje wyszukiwarka menedżera, więc takie nazwy to duplikat.
CREATE OR REPLACE FUNCTION public._qb_tag_key(p_name text) RETURNS text
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(translate(coalesce(p_name, ''), 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz'));
$$;

-- Tworzy (p_id NULL) albo zmienia tag. Zwraca {id, before:{name,color}|null}.
CREATE OR REPLACE FUNCTION public.qb_save_tag(p_base_id uuid, p_id uuid, p_name text, p_color text) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '^#', ''), 40);
  v_color text := coalesce(nullif(btrim(p_color), ''), '#4da3ff');
  v_before jsonb;
  v_id uuid;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  -- litery (także polskie, decyzja 2026-10-20), cyfry i _
  IF v_name !~ '^[a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$' THEN RAISE EXCEPTION 'qb:invalid' USING errcode = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.qb_tags WHERE base_id = p_base_id AND public._qb_tag_key(name) = public._qb_tag_key(v_name)
              AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'qb:duplicate' USING errcode = 'P0001';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.qb_tags (base_id, name, color, ord) VALUES (p_base_id, v_name, v_color, 9999)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'before', NULL);
  END IF;

  SELECT jsonb_build_object('name', name, 'color', color) INTO v_before
    FROM public.qb_tags WHERE id = p_id AND base_id = p_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001'; END IF;
  UPDATE public.qb_tags SET name = v_name, color = v_color WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'before', v_before);
END;
$$;

-- Usuwa tagi z przypisaniami. Zwraca usunięte tagi i ich przypisania:
-- {tags:[{id,name,color,ord}], questionLinks:[{question_id,tag_id}],
--  folderLinks:[{category_id,tag_id}]}.
CREATE OR REPLACE FUNCTION public.qb_delete_tags(p_base_id uuid, p_tag_ids uuid[]) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
  v_ids uuid[];
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM public.qb_tags
   WHERE base_id = p_base_id AND id = ANY(coalesce(p_tag_ids, '{}'));
  IF cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(coalesce(p_tag_ids, '{}')) x) THEN
    RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'tags', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'ord', ord))
       FROM public.qb_tags WHERE id = ANY(v_ids)), '[]'),
    'questionLinks', coalesce((SELECT jsonb_agg(jsonb_build_object('question_id', question_id, 'tag_id', tag_id))
       FROM public.qb_question_tags WHERE tag_id = ANY(v_ids)), '[]'),
    'folderLinks', coalesce((SELECT jsonb_agg(jsonb_build_object('category_id', category_id, 'tag_id', tag_id))
       FROM public.qb_category_tags WHERE tag_id = ANY(v_ids)), '[]')
  ) INTO v_before;

  DELETE FROM public.qb_tags WHERE id = ANY(v_ids); -- przypisania: ON DELETE CASCADE
  RETURN v_before;
END;
$$;

-- Nadaje (p_on) albo zdejmuje tagi. Foldery rozwijane do pytań z całego
-- poddrzewa; przy zdejmowaniu znikają też bezpośrednie przypisania
-- folderów (qb_category_tags). Zwraca faktycznie zmienione przypisania:
-- {questionLinks:[{question_id,tag_id}], folderLinks:[{category_id,tag_id}]}.
CREATE OR REPLACE FUNCTION public.qb_set_tag_links(p_base_id uuid, p_tag_ids uuid[], p_question_ids uuid[], p_folder_ids uuid[], p_on boolean) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_q uuid[];
  v_folders uuid[];
  v_qlinks jsonb;
  v_flinks jsonb := '[]';
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_items(p_base_id, p_question_ids, p_folder_ids);
  IF (SELECT count(DISTINCT x) FROM unnest(coalesce(p_tag_ids, '{}')) x)
     <> (SELECT count(*) FROM public.qb_tags WHERE base_id = p_base_id AND id = ANY(coalesce(p_tag_ids, '{}'))) THEN
    RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_folders FROM public._qb_folder_subtree(p_base_id, p_folder_ids);
  SELECT coalesce(array_agg(DISTINCT id), '{}') INTO v_q FROM public.qb_questions
   WHERE base_id = p_base_id AND (id = ANY(coalesce(p_question_ids, '{}')) OR category_id = ANY(v_folders));

  IF p_on THEN
    WITH ins AS (
      INSERT INTO public.qb_question_tags (question_id, tag_id)
      SELECT q, t FROM unnest(v_q) q CROSS JOIN unnest(p_tag_ids) t
      WHERE NOT EXISTS (SELECT 1 FROM public.qb_question_tags l WHERE l.question_id = q AND l.tag_id = t)
      RETURNING question_id, tag_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('question_id', question_id, 'tag_id', tag_id)), '[]') INTO v_qlinks FROM ins;
  ELSE
    WITH del AS (
      DELETE FROM public.qb_question_tags WHERE question_id = ANY(v_q) AND tag_id = ANY(p_tag_ids)
      RETURNING question_id, tag_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('question_id', question_id, 'tag_id', tag_id)), '[]') INTO v_qlinks FROM del;
    WITH del AS (
      DELETE FROM public.qb_category_tags WHERE category_id = ANY(coalesce(p_folder_ids, '{}')) AND tag_id = ANY(p_tag_ids)
      RETURNING category_id, tag_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('category_id', category_id, 'tag_id', tag_id)), '[]') INTO v_flinks FROM del;
  END IF;

  RETURN jsonb_build_object('questionLinks', v_qlinks, 'folderLinks', v_flinks);
END;
$$;

-- Zapis stanów tri-state z okna tagów: p_on = tagi „wszystkie”, p_off =
-- tagi „żadne” dla pytań (foldery rozwinięte do poddrzewa). Jedna transakcja.
CREATE OR REPLACE FUNCTION public.qb_apply_tag_states(p_base_id uuid, p_question_ids uuid[], p_folder_ids uuid[], p_on uuid[], p_off uuid[]) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_added jsonb := '[]';
  v_removed jsonb := '[]';
BEGIN
  IF cardinality(coalesce(p_on, '{}')) > 0 THEN
    v_added := public.qb_set_tag_links(p_base_id, p_on, p_question_ids, p_folder_ids, true)->'questionLinks';
  END IF;
  IF cardinality(coalesce(p_off, '{}')) > 0 THEN
    -- okno tagów dotyczy pytań: bez bezpośrednich przypisań folderów
    v_removed := public.qb_set_tag_links(p_base_id, p_off,
      (SELECT coalesce(array_agg(id), '{}') FROM public.qb_questions
        WHERE base_id = p_base_id AND (id = ANY(coalesce(p_question_ids, '{}'))
          OR category_id IN (SELECT id FROM public._qb_folder_subtree(p_base_id, p_folder_ids)))),
      NULL, false)->'questionLinks';
  END IF;
  RETURN jsonb_build_object('added', v_added, 'removed', v_removed);
END;
$$;

-- Odtwarza / usuwa konkretne przypisania (cofanie operacji na tagach).
-- Przypisania do elementów lub tagów, których już nie ma, są pomijane.
CREATE OR REPLACE FUNCTION public.qb_restore_tag_links(p_base_id uuid, p_add jsonb, p_remove jsonb) RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);

  DELETE FROM public.qb_question_tags l
   USING jsonb_array_elements(coalesce(p_remove, '[]')) x
   WHERE l.question_id = (x->>'question_id')::uuid AND l.tag_id = (x->>'tag_id')::uuid
     AND EXISTS (SELECT 1 FROM public.qb_tags t WHERE t.id = l.tag_id AND t.base_id = p_base_id);

  INSERT INTO public.qb_question_tags (question_id, tag_id)
  SELECT DISTINCT (x->>'question_id')::uuid, (x->>'tag_id')::uuid
    FROM jsonb_array_elements(coalesce(p_add, '[]')) x
   WHERE EXISTS (SELECT 1 FROM public.qb_questions q WHERE q.id = (x->>'question_id')::uuid AND q.base_id = p_base_id)
     AND EXISTS (SELECT 1 FROM public.qb_tags t WHERE t.id = (x->>'tag_id')::uuid AND t.base_id = p_base_id)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public._qb_assert_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._qb_folder_subtree(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._qb_assert_items(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._qb_assert_folder(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._qb_assert_no_cycle(uuid, uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._qb_unique_folder_name(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._qb_insert_question_copies(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._qb_assert_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qb_folder_subtree(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qb_assert_items(uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qb_assert_folder(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qb_assert_no_cycle(uuid, uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qb_unique_folder_name(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qb_insert_question_copies(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.qb_create_folder(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_create_question(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_rename_folder(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_set_question_text(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_save_question(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_delete_items(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_move_items(uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_reorder_folders(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_restore_positions(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_copy_items(uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_save_tag(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_delete_tags(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_set_tag_links(uuid, uuid[], uuid[], uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_apply_tag_states(uuid, uuid[], uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_restore_tag_links(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qb_create_folder(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_create_question(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_rename_folder(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_set_question_text(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_save_question(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_delete_items(uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_move_items(uuid, uuid[], uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_reorder_folders(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_restore_positions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_copy_items(uuid, uuid[], uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_save_tag(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_delete_tags(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_set_tag_links(uuid, uuid[], uuid[], uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_apply_tag_states(uuid, uuid[], uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_restore_tag_links(uuid, jsonb, jsonb) TO authenticated;
