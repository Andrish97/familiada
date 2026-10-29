-- Migration 223: RPC get_poll_preview
-- Zastępuje N+1 query w previewResults() jednym wywołaniem RPC.
--
-- Przypadki:
--   status = 'ready'    → pytania + odpowiedzi z fixed_points (po zamknięciu ankiety)
--   type = 'poll_points'→ pytania + odpowiedzi + liczba głosów z ostatniej sesji
--   type = 'poll_text'  → pytania + pogrupowane wpisy tekstowe z ostatniej sesji

CREATE OR REPLACE FUNCTION get_poll_preview(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_type   text;
  v_result jsonb;
BEGIN
  -- Sprawdź własność gry (SECURITY DEFINER wymaga ręcznego sprawdzenia)
  SELECT status, type INTO v_status, v_type
  FROM games
  WHERE id = p_game_id AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_unauthorized';
  END IF;

  -- CASE 1: Ankieta zamknięta (status = 'ready')
  -- Zwraca pytania + odpowiedzi z fixed_points
  IF v_status = 'ready' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',      q.id,
        'ord',     q.ord,
        'text',    q.text,
        'answers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id',           a.id,
              'text',         a.text,
              'fixed_points', COALESCE(a.fixed_points, 0)
            ) ORDER BY a.ord
          ), '[]'::jsonb)
          FROM answers a
          WHERE a.question_id = q.id
        )
      ) ORDER BY q.ord
    ) INTO v_result
    FROM questions q
    WHERE q.game_id = p_game_id;

  -- CASE 2: poll_points LIVE
  -- Zwraca pytania + odpowiedzi + liczba głosów z ostatniej sesji per pytanie
  ELSIF v_type = 'poll_points' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',      q.id,
        'ord',     q.ord,
        'text',    q.text,
        'answers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id',    a.id,
              'text',  a.text,
              'votes', COALESCE((
                SELECT COUNT(*)
                FROM poll_votes pv
                WHERE pv.answer_id = a.id
                  AND pv.poll_session_id = (
                    SELECT ps.id FROM poll_sessions ps
                    WHERE ps.game_id = p_game_id
                      AND ps.question_id = q.id
                    ORDER BY ps.created_at DESC
                    LIMIT 1
                  )
              ), 0)
            ) ORDER BY a.ord
          ), '[]'::jsonb)
          FROM answers a
          WHERE a.question_id = q.id
        )
      ) ORDER BY q.ord
    ) INTO v_result
    FROM questions q
    WHERE q.game_id = p_game_id;

  -- CASE 3: poll_text LIVE
  -- Zwraca pytania + pogrupowane wpisy tekstowe (top 12 per pytanie) z ostatniej sesji
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',        q.id,
        'ord',       q.ord,
        'text',      q.text,
        'text_rows', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object('text', sub.answer_norm, 'val', sub.cnt)
            ORDER BY sub.cnt DESC
          ), '[]'::jsonb)
          FROM (
            SELECT pte.answer_norm, COUNT(*) AS cnt
            FROM poll_text_entries pte
            WHERE pte.poll_session_id = (
                SELECT ps.id FROM poll_sessions ps
                WHERE ps.game_id = p_game_id
                  AND ps.question_id = q.id
                ORDER BY ps.created_at DESC
                LIMIT 1
              )
              AND pte.question_id = q.id
              AND pte.answer_norm IS NOT NULL
              AND trim(pte.answer_norm) != ''
            GROUP BY pte.answer_norm
            ORDER BY cnt DESC
            LIMIT 12
          ) sub
        )
      ) ORDER BY q.ord
    ) INTO v_result
    FROM questions q
    WHERE q.game_id = p_game_id;
  END IF;

  RETURN jsonb_build_object(
    'status',    v_status,
    'type',      v_type,
    'questions', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

-- Revoke domyślny dostęp publiczny, przyznaj tylko authenticated
REVOKE ALL ON FUNCTION get_poll_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_poll_preview(uuid) TO authenticated;
