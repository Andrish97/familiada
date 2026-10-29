-- Wspólny próg punktacji dla ankiet tekstowych i punktowych.
-- Udział liczymy od wszystkich głosów, zaokrąglamy do pełnego procentu;
-- odpowiedzi poniżej 3% nie otrzymują punktów.

CREATE OR REPLACE FUNCTION public._poll_points_normalize(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  WITH last_sess AS (
    SELECT DISTINCT ON (ps.question_id)
      ps.question_id, ps.id AS poll_session_id
    FROM public.poll_sessions ps
    WHERE ps.game_id = p_game_id
    ORDER BY ps.question_id, ps.created_at DESC
  ), answers AS (
    SELECT q.id AS question_id, an.id AS answer_id, an.ord AS aord
    FROM public.questions q
    JOIN public.answers an ON an.question_id = q.id
    WHERE q.game_id = p_game_id
  ), counts AS (
    SELECT a.question_id, a.answer_id, a.aord,
      count(v.id)::bigint AS votes
    FROM answers a
    LEFT JOIN last_sess ls ON ls.question_id = a.question_id
    LEFT JOIN public.poll_votes v
      ON v.poll_session_id = ls.poll_session_id
     AND v.answer_id = a.answer_id
    GROUP BY a.question_id, a.answer_id, a.aord
  ), totals AS (
    SELECT question_id, sum(votes)::bigint AS total
    FROM counts
    GROUP BY question_id
  ), shares AS (
    SELECT c.question_id, c.answer_id, c.aord, c.votes, t.total,
      CASE WHEN t.total > 0 THEN floor(100.0 * c.votes / t.total)::int ELSE 0 END AS base_points,
      CASE WHEN t.total > 0 THEN (100 * c.votes) % t.total ELSE 0 END AS remainder,
      CASE WHEN t.total > 0 THEN round(100.0 * c.votes / t.total)::int ELSE 0 END AS rounded_percent
    FROM counts c
    JOIN totals t USING (question_id)
  ), ranked AS (
    SELECT s.*,
      100 - sum(s.base_points) OVER (PARTITION BY s.question_id) AS points_left,
      row_number() OVER (PARTITION BY s.question_id ORDER BY s.remainder DESC, s.aord ASC) AS remainder_rank
    FROM shares s
  ), final_points AS (
    SELECT question_id, answer_id,
      CASE
        WHEN total = 0 OR rounded_percent < 3 THEN 0
        ELSE base_points + CASE WHEN remainder_rank <= points_left THEN 1 ELSE 0 END
      END AS points
    FROM ranked
  )
  UPDATE public.answers a
  SET fixed_points = f.points
  FROM final_points f
  WHERE a.id = f.answer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._poll_text_tally_points(p_answers jsonb)
RETURNS TABLE(ord integer, atext text, points integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  used_points integer[] := ARRAY[]::integer[];
  p integer;
  n integer := 0;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  FOR r IN
    WITH grouped AS (
      SELECT min(src.idx) AS idx,
        (array_agg(src.txt ORDER BY src.idx))[1] AS txt,
        sum(src.cnt)::bigint AS cnt
      FROM (
        SELECT x.i::integer AS idx,
          left(btrim(coalesce(x.v->>'text', '')), 17) AS txt,
          CASE WHEN jsonb_typeof(x.v->'count') = 'number'
            THEN greatest(0, floor((x.v->>'count')::numeric))::bigint ELSE 0 END AS cnt
        FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS x(v, i)
      ) src
      WHERE src.txt <> '' AND src.cnt > 0
      GROUP BY lower(src.txt)
    ), shares AS (
      SELECT g.idx, g.txt, g.cnt,
        floor(100.0 * g.cnt / totals.total)::integer AS base_points,
        (100 * g.cnt) % totals.total AS remainder,
        round(100.0 * g.cnt / totals.total)::integer AS rounded_percent
      FROM grouped g
      CROSS JOIN (SELECT sum(cnt) AS total FROM grouped) totals
    ), ranked AS (
      SELECT shares.*,
        100 - sum(base_points) OVER () AS points_left,
        row_number() OVER (ORDER BY remainder DESC, idx ASC) AS remainder_rank
      FROM shares
    )
    SELECT txt,
      base_points + CASE WHEN remainder_rank <= points_left THEN 1 ELSE 0 END AS pts,
      remainder_rank
    FROM ranked
    WHERE rounded_percent >= 3
    ORDER BY 2 DESC, remainder_rank
    LIMIT 6
  LOOP
    p := r.pts;
    WHILE p > 0 AND p = ANY(used_points) LOOP
      p := p - 1;
    END LOOP;
    used_points := used_points || p;
    n := n + 1;
    ord := n;
    atext := r.txt;
    points := p;
    RETURN NEXT;
  END LOOP;
END;
$$;
