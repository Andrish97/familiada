BEGIN;

CREATE OR REPLACE FUNCTION public.polls_hub_anon_voters(p_game_id uuid, p_poll_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  qn int := 0;
  tok_cnt int := 0;
  legacy_rows int := 0;
  legacy_est int := 0;
BEGIN
  SELECT count(*)::int INTO qn
  FROM public.questions
  WHERE game_id = p_game_id;

  IF p_poll_type = 'poll_points' THEN
    -- NOWE: tokeny anonimowe (per gra)
    SELECT count(DISTINCT v.voter_token)::int INTO tok_cnt
    FROM public.poll_votes v
    WHERE v.game_id = p_game_id
      AND v.voter_user_id IS NULL
      AND v.voter_token IS NOT NULL
      AND v.voter_token <> ''
      AND v.voter_token NOT LIKE 'task:%';

    -- STARE: brak tokena / pusty token (legacy)
    SELECT count(*)::int INTO legacy_rows
    FROM public.poll_votes v
    WHERE v.game_id = p_game_id
      AND v.voter_user_id IS NULL
      AND (v.voter_token IS NULL OR v.voter_token = '');

  ELSIF p_poll_type = 'poll_text' THEN
    -- NOWE: tokeny anonimowe (per gra)
    SELECT count(DISTINCT e.voter_token)::int INTO tok_cnt
    FROM public.poll_text_entries e
    WHERE e.game_id = p_game_id
      AND e.voter_user_id IS NULL
      AND e.voter_token IS NOT NULL
      AND e.voter_token <> ''
      AND e.voter_token NOT LIKE 'task:%';

    -- STARE: brak tokena / pusty token (legacy)
    SELECT count(*)::int INTO legacy_rows
    FROM public.poll_text_entries e
    WHERE e.game_id = p_game_id
      AND e.voter_user_id IS NULL
      AND (e.voter_token IS NULL OR e.voter_token = '');
  ELSE
    tok_cnt := 0;
    legacy_rows := 0;
  END IF;

  -- legacy est: total legacy rows / liczba pytań (ceil), min 1 jeśli cokolwiek jest
  IF legacy_rows > 0 AND qn > 0 THEN
    legacy_est := GREATEST(1, CEIL(legacy_rows::numeric / qn::numeric))::int;
  ELSE
    legacy_est := 0;
  END IF;

  RETURN tok_cnt + legacy_est;
END;
$function$;

-- jeśli RPC jest wołane przez authenticated, to grant zwykle już jest, ale nie zaszkodzi:
GRANT EXECUTE ON FUNCTION public.polls_hub_anon_voters(uuid, text) TO authenticated;

COMMIT;

notify pgrst, 'reload schema';
