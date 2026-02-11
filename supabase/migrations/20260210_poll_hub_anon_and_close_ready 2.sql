BEGIN;

CREATE OR REPLACE FUNCTION public.polls_hub_can_close_poll_points(p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  q record;
  sid uuid;
  strong_cnt int;
BEGIN
  FOR q IN
    SELECT id FROM public.questions WHERE game_id = p_game_id ORDER BY ord
  LOOP
    -- ostatnia sesja dla pytania (jak w polls.js)
    SELECT ps.id
      INTO sid
    FROM public.poll_sessions ps
    WHERE ps.game_id = p_game_id AND ps.question_id = q.id
    ORDER BY ps.created_at DESC
    LIMIT 1;

    IF sid IS NULL THEN
      RETURN FALSE;
    END IF;

    /*
      poll.js:
        - bierzemy tylko votes z answer_id != null
        - counts tylko dla odpowiedzi z count>0
        - normalizacja do 100 przez floor + największe reszty (diff>0)
        - strong = points>=3
        - strong_cnt>=3
    */
    WITH counts AS (
      SELECT v.answer_id, count(*)::int AS cnt
      FROM public.poll_votes v
      WHERE v.game_id = p_game_id
        AND v.question_id = q.id
        AND v.poll_session_id = sid
        AND v.answer_id IS NOT NULL
      GROUP BY v.answer_id
      HAVING count(*) > 0
    ),
    total AS (
      SELECT sum(cnt)::numeric AS s FROM counts
    ),
    raw AS (
      SELECT
        answer_id,
        cnt,
        (100 * cnt::numeric) / NULLIF((SELECT s FROM total), 0) AS pct
      FROM counts
    ),
    floored AS (
      SELECT
        answer_id,
        cnt,
        pct,
        floor(pct)::int AS pts,
        (pct - floor(pct)) AS frac
      FROM raw
    ),
    sum_floor AS (
      SELECT coalesce(sum(pts), 0)::int AS s FROM floored
    ),
    diff AS (
      SELECT (100 - (SELECT s FROM sum_floor))::int AS d
    ),
    ranked AS (
      SELECT
        f.*,
        row_number() OVER (ORDER BY f.frac DESC, f.answer_id) AS rn
      FROM floored f
    ),
    distributed AS (
      SELECT
        answer_id,
        (pts + CASE WHEN (SELECT d FROM diff) > 0 AND rn <= (SELECT d FROM diff) THEN 1 ELSE 0 END)::int AS p_final
      FROM ranked
    )
    SELECT count(*)::int
      INTO strong_cnt
    FROM distributed
    WHERE p_final >= 3;

    -- jeśli nie ma żadnych głosów (counts puste) => distributed puste => strong_cnt=0 => FALSE
    IF COALESCE(strong_cnt, 0) < 3 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$;

COMMIT;

-- odśwież postgrest cache, żeby hub od razu widział poprawkę
notify pgrst, 'reload schema';
