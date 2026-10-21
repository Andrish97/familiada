-- 428: Menedżer bazy — kosz (E22 etap 2).
-- Usunięcie w menedżerze nie kasuje już na stałe: każdy usunięty element
-- najwyższego poziomu (pytanie albo folder z całym poddrzewem) trafia do
-- kosza jako jeden wpis ze zrzutem wierszy (oryginalne id, tagi pytań).
-- Odczyty qb_* bez zmian — usunięte elementy po prostu nie istnieją
-- w tabelach. Przywrócenie odtwarza wiersze z tymi samymi id (folder
-- nadrzędny, którego już nie ma → korzeń; tagi, których już nie ma, są
-- pomijane). Po 30 dniach wpis znika (cron codziennie), można też usunąć
-- trwale ręcznie albo opróżnić kosz. Kosz osobny dla każdej bazy, widzą
-- go właściciel i edytorzy; usunięcie bazy usuwa jej kosz.

CREATE TABLE IF NOT EXISTS public.qb_trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL REFERENCES public.question_bases(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('question', 'folder')),
  label text NOT NULL DEFAULT '',
  origin_id uuid,                -- folder nadrzędny / folder pytania w chwili usunięcia
  item_id uuid NOT NULL,         -- id usuniętego pytania / folderu (wraca przy przywróceniu)
  n_questions int NOT NULL DEFAULT 0,
  n_folders int NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,       -- {folders:[…], questions:[…], questionTags:[…]}
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qb_trash_base_idx ON public.qb_trash (base_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS qb_trash_deleted_at_idx ON public.qb_trash (deleted_at);

ALTER TABLE public.qb_trash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qb_trash_select ON public.qb_trash;
DROP POLICY IF EXISTS qb_trash_write ON public.qb_trash;
CREATE POLICY qb_trash_select ON public.qb_trash FOR SELECT
  USING (public.base_can_edit(base_id, auth.uid()));
CREATE POLICY qb_trash_write ON public.qb_trash
  USING (public.base_can_edit(base_id, auth.uid()))
  WITH CHECK (public.base_can_edit(base_id, auth.uid()));
-- UPDATE: przywracanie blokuje wpis (SELECT … FOR UPDATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qb_trash TO authenticated;

-- Do kosza: zastępuje twarde usuwanie z 427 (ta sama sygnatura i wynik,
-- plus trash: [id wpisów]). Wpis na każdy element najwyższego poziomu:
-- pytanie z zaznaczenia, które nie leży w zaznaczonym folderze, i folder,
-- który nie leży w innym zaznaczonym folderze.
CREATE OR REPLACE FUNCTION public.qb_delete_items(p_base_id uuid, p_question_ids uuid[], p_folder_ids uuid[]) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_all_folders uuid[];
  v_top_folders uuid[];
  v_sub uuid[];
  v_trash uuid[] := '{}';
  v_tid uuid;
  v_q int := 0;
  v_c int := 0;
  r record;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  PERFORM public._qb_assert_items(p_base_id, p_question_ids, p_folder_ids);

  SELECT coalesce(array_agg(id), '{}') INTO v_all_folders FROM public._qb_folder_subtree(p_base_id, p_folder_ids);
  -- foldery najwyższego poziomu: rodzic nie jest w poddrzewie innego zaznaczonego
  SELECT coalesce(array_agg(c.id), '{}') INTO v_top_folders
    FROM public.qb_categories c
   WHERE c.base_id = p_base_id AND c.id = ANY(coalesce(p_folder_ids, '{}'))
     AND (c.parent_id IS NULL OR NOT c.parent_id = ANY(v_all_folders));

  FOR r IN SELECT c.* FROM public.qb_categories c WHERE c.id = ANY(v_top_folders) ORDER BY c.ord LOOP
    SELECT coalesce(array_agg(id), '{}') INTO v_sub FROM public._qb_folder_subtree(p_base_id, ARRAY[r.id]);
    INSERT INTO public.qb_trash (base_id, kind, label, origin_id, item_id, n_questions, n_folders, snapshot, deleted_by)
    SELECT p_base_id, 'folder', r.name, r.parent_id, r.id,
      (SELECT count(*) FROM public.qb_questions WHERE base_id = p_base_id AND category_id = ANY(v_sub)),
      cardinality(v_sub),
      jsonb_build_object(
        'folders', (SELECT jsonb_agg(to_jsonb(c)) FROM public.qb_categories c WHERE c.id = ANY(v_sub)),
        'questions', coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM public.qb_questions q
                                WHERE q.base_id = p_base_id AND q.category_id = ANY(v_sub)), '[]'),
        'questionTags', coalesce((SELECT jsonb_agg(jsonb_build_object('question_id', l.question_id, 'tag_id', l.tag_id))
                                   FROM public.qb_question_tags l JOIN public.qb_questions q ON q.id = l.question_id
                                  WHERE q.base_id = p_base_id AND q.category_id = ANY(v_sub)), '[]')),
      auth.uid()
    RETURNING id INTO v_tid;
    v_trash := v_trash || v_tid;
  END LOOP;

  FOR r IN SELECT q.* FROM public.qb_questions q
            WHERE q.base_id = p_base_id AND q.id = ANY(coalesce(p_question_ids, '{}'))
              AND (q.category_id IS NULL OR NOT q.category_id = ANY(v_all_folders))
            ORDER BY q.ord LOOP
    INSERT INTO public.qb_trash (base_id, kind, label, origin_id, item_id, n_questions, n_folders, snapshot, deleted_by)
    VALUES (p_base_id, 'question', coalesce(r.payload->>'text', ''), r.category_id, r.id, 1, 0,
      jsonb_build_object(
        'folders', '[]'::jsonb,
        'questions', jsonb_build_array(to_jsonb(r)),
        'questionTags', coalesce((SELECT jsonb_agg(jsonb_build_object('question_id', l.question_id, 'tag_id', l.tag_id))
                                   FROM public.qb_question_tags l WHERE l.question_id = r.id), '[]')),
      auth.uid())
    RETURNING id INTO v_tid;
    v_trash := v_trash || v_tid;
  END LOOP;

  DELETE FROM public.qb_questions
   WHERE base_id = p_base_id
     AND (id = ANY(coalesce(p_question_ids, '{}')) OR category_id = ANY(v_all_folders));
  GET DIAGNOSTICS v_q = ROW_COUNT;
  DELETE FROM public.qb_categories WHERE base_id = p_base_id AND id = ANY(v_all_folders);
  GET DIAGNOSTICS v_c = ROW_COUNT;

  RETURN jsonb_build_object('questions', v_q, 'folders', v_c, 'trash', to_jsonb(v_trash));
END;
$$;

-- Lista kosza bazy (bez zrzutów), najnowsze pierwsze.
CREATE OR REPLACE FUNCTION public.qb_trash_list(p_base_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'label', t.label, 'item_id', t.item_id, 'origin_id', t.origin_id,
      'n_questions', t.n_questions, 'n_folders', t.n_folders,
      'deleted_at', t.deleted_at, 'expires_at', t.deleted_at + interval '30 days')
      ORDER BY t.deleted_at DESC, t.id)
    FROM public.qb_trash t WHERE t.base_id = p_base_id), '[]');
END;
$$;

-- Przywraca wpisy kosza. Zwraca {questions:[id przywróconych pytań
-- najwyższego poziomu], folders:[id przywróconych folderów]}.
-- Wpis, którego już nie ma (przywrócony / usunięty gdzie indziej) = qb:gone.
CREATE OR REPLACE FUNCTION public.qb_trash_restore(p_base_id uuid, p_trash_ids uuid[]) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_parent uuid;
  v_q jsonb := '[]';
  v_f jsonb := '[]';
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  IF (SELECT count(DISTINCT x) FROM unnest(coalesce(p_trash_ids, '{}')) x)
     <> (SELECT count(*) FROM public.qb_trash WHERE base_id = p_base_id AND id = ANY(coalesce(p_trash_ids, '{}'))) THEN
    RAISE EXCEPTION 'qb:gone' USING errcode = 'P0001';
  END IF;

  FOR r IN SELECT * FROM public.qb_trash
            WHERE base_id = p_base_id AND id = ANY(p_trash_ids)
            ORDER BY deleted_at, id
            FOR UPDATE LOOP
    -- miejsce: dawny folder, jeśli nadal jest w bazie, inaczej korzeń
    SELECT id INTO v_parent FROM public.qb_categories WHERE id = r.origin_id AND base_id = p_base_id;

    INSERT INTO public.qb_categories (id, base_id, parent_id, name, ord, created_at, updated_at)
    SELECT f.id, p_base_id,
           CASE WHEN f.id = r.item_id THEN v_parent ELSE f.parent_id END,
           f.name, f.ord, f.created_at, f.updated_at
      FROM jsonb_populate_recordset(NULL::public.qb_categories, r.snapshot->'folders') f
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.qb_questions (id, base_id, category_id, ord, payload, created_at, updated_at, updated_by)
    SELECT q.id, p_base_id,
           CASE WHEN r.kind = 'question' THEN v_parent ELSE q.category_id END,
           q.ord, q.payload, q.created_at, q.updated_at, q.updated_by
      FROM jsonb_populate_recordset(NULL::public.qb_questions, r.snapshot->'questions') q
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.qb_question_tags (question_id, tag_id)
    SELECT (l->>'question_id')::uuid, (l->>'tag_id')::uuid
      FROM jsonb_array_elements(coalesce(r.snapshot->'questionTags', '[]')) l
     WHERE EXISTS (SELECT 1 FROM public.qb_tags t WHERE t.id = (l->>'tag_id')::uuid AND t.base_id = p_base_id)
       AND EXISTS (SELECT 1 FROM public.qb_questions q WHERE q.id = (l->>'question_id')::uuid AND q.base_id = p_base_id)
    ON CONFLICT DO NOTHING;

    IF r.kind = 'folder' THEN v_f := v_f || to_jsonb(r.item_id); ELSE v_q := v_q || to_jsonb(r.item_id); END IF;
    DELETE FROM public.qb_trash WHERE id = r.id;
  END LOOP;

  RETURN jsonb_build_object('questions', v_q, 'folders', v_f);
END;
$$;

-- Usuwa trwale wpisy kosza; p_trash_ids NULL = opróżnij kosz bazy.
-- Zwraca liczbę usuniętych wpisów.
CREATE OR REPLACE FUNCTION public.qb_trash_purge(p_base_id uuid, p_trash_ids uuid[]) RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  v_n int;
BEGIN
  PERFORM public._qb_assert_edit(p_base_id);
  DELETE FROM public.qb_trash
   WHERE base_id = p_base_id AND (p_trash_ids IS NULL OR id = ANY(p_trash_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Czyszczenie po 30 dniach (cron; bez użytkownika, więc SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.qb_trash_cleanup() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_n int;
BEGIN
  DELETE FROM public.qb_trash WHERE deleted_at < now() - interval '30 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_trash_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_trash_restore(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_trash_purge(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qb_trash_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_trash_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_trash_restore(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qb_trash_purge(uuid, uuid[]) TO authenticated;

DO $$
DECLARE
  v_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''qb-trash-cleanup'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
    PERFORM cron.schedule('qb-trash-cleanup', '17 2 * * *', 'SELECT public.qb_trash_cleanup()');
  END IF;
END $$;
