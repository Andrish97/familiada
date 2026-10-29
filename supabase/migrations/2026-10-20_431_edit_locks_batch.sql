-- 431: Blokady zbiorcze (E22, etap 8d) — menedżer bazy blokuje całe
-- poddrzewa (foldery + pytania), czyli przy dużym folderze setki zasobów.
-- Dotąd każdy zasób = osobne zapytanie na start i osobne odnawianie co 8 s
-- (500 pytań: 500 zapytań na start i 500 co 8 s). Teraz jedno zapytanie
-- na cały zestaw: każdy zasób przez istniejące acquire_edit_lock_mode
-- (te same reguły: istnienie, uprawnienia, blokady innych kart, TTL),
-- w stałej kolejności (bez zakleszczeń), wszystko albo nic — pierwsza
-- odmowa wycofuje już zajęte z tego wywołania i zwraca jej wynik
-- z polem resource. Odnowienie = to samo wywołanie. Tylko dodaje funkcje.
-- p_resources: [{"type": "base_question", "id": "<uuid>"}, …]

CREATE OR REPLACE FUNCTION public.acquire_edit_locks(p_resources jsonb, p_tab_id text, p_context text DEFAULT NULL, p_mode text DEFAULT 'exclusive') RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_res jsonb;
  v_fail jsonb;
  v_n int := 0;
BEGIN
  BEGIN
    FOR r IN SELECT DISTINCT x->>'type' AS type, (x->>'id')::uuid AS id
               FROM jsonb_array_elements(coalesce(p_resources, '[]'::jsonb)) x
              ORDER BY 1, 2 LOOP
      v_res := public.acquire_edit_lock_mode(r.type, r.id, p_tab_id, p_context, p_mode);
      IF NOT coalesce((v_res->>'ok')::boolean, false) THEN
        v_fail := v_res || jsonb_build_object('resource', jsonb_build_object('type', r.type, 'id', r.id));
        RAISE EXCEPTION 'edit_locks:refused';
      END IF;
      v_n := v_n + 1;
    END LOOP;
  EXCEPTION WHEN raise_exception THEN
    IF v_fail IS NOT NULL THEN RETURN v_fail; END IF;
    RAISE;
  END;
  RETURN jsonb_build_object('ok', true, 'count', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_edit_locks(p_resources jsonb, p_tab_id text) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT x->>'type' AS type, (x->>'id')::uuid AS id
             FROM jsonb_array_elements(coalesce(p_resources, '[]'::jsonb)) x LOOP
    PERFORM public.release_edit_lock(r.type, r.id, p_tab_id);
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_edit_locks(jsonb, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_edit_locks(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_edit_locks(jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_edit_locks(jsonb, text) TO authenticated;
