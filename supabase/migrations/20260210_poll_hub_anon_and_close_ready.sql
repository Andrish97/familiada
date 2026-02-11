-- 2026-02-10
-- Polls Hub: anon voters per poll + close-ready flag (green) for open polls
-- Logic:
--   - NEW votes: count DISTINCT voter_token (anon only, excluding task:* tokens)
--   - LEGACY votes (missing token): estimate as ceil(total_rows_missing_token / question_count)
--   - close_ready: same validation as polls.js (server-side)

BEGIN;

-- =========================
-- Helpers: anon voters
-- =========================

CREATE OR REPLACE FUNCTION public.polls_hub_anon_voters_poll_points(p_game_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  qn int;
  v_new int;
  v_legacy_rows int;
  v_legacy_est int;
BEGIN
  SELECT count(*)::int INTO qn
  FROM public.questions q
  WHERE q.game_id = p_game_id;

  -- new style: distinct voter_token (anon only), exclude task:* (bo to nie są anon w hubie)
  SELECT count(DISTINCT v.voter_token)::int INTO v_new
  FROM public.poll_votes v
  WHERE v.game_id = p_game_id
    AND v.voter_user_id IS NULL
    AND NULLIF(btrim(v.voter_token), '') IS NOT NULL
    AND v.voter_token NOT LIKE 'task:%';

  -- legacy: missing token (NULL/empty)
  SELECT count(*)::int INTO v_legacy_rows
  FROM public.poll_votes v
  WHERE v.game_id = p_game_id
    AND v.voter_user_id IS NULL
    AND NULLIF(btrim(v.voter_token), '') IS NULL;

  v_legacy_est := CASE
    WHEN COALESCE(qn, 0) > 0 AND COALESCE(v_legacy_rows, 0) > 0
      THEN CEIL((v_legacy_rows::numeric) / NULLIF(qn::numeric, 0))::int
    ELSE 0
  END;

  RETURN COALESCE(v_new, 0) + COALESCE(v_legacy_est, 0);
END;
$function$;


CREATE OR REPLACE FUNCTION public.polls_hub_anon_voters_poll_text(p_game_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  qn int;
  v_new int;
  v_legacy_rows int;
  v_legacy_est int;
BEGIN
  SELECT count(*)::int INTO qn
  FROM public.questions q
  WHERE q.game_id = p_game_id;

  SELECT count(DISTINCT e.voter_token)::int INTO v_new
  FROM public.poll_text_entries e
  WHERE e.game_id = p_game_id
    AND e.voter_user_id IS NULL
    AND NULLIF(btrim(e.voter_token), '') IS NOT NULL
    AND e.voter_token NOT LIKE 'task:%';

  SELECT count(*)::int INTO v_legacy_rows
  FROM public.poll_text_entries e
  WHERE e.game_id = p_game_id
    AND e.voter_user_id IS NULL
    AND NULLIF(btrim(e.voter_token), '') IS NULL;

  v_legacy_est := CASE
    WHEN COALESCE(qn, 0) > 0 AND COALESCE(v_legacy_rows, 0) > 0
      THEN CEIL((v_legacy_rows::numeric) / NULLIF(qn::numeric, 0))::int
    ELSE 0
  END;

  RETURN COALESCE(v_new, 0) + COALESCE(v_legacy_est, 0);
END;
$function$;


CREATE OR REPLACE FUNCTION public.polls_hub_anon_voters(p_game_id uuid, p_poll_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN CASE
    WHEN p_poll_type = 'poll_points' THEN public.polls_hub_anon_voters_poll_points(p_game_id)
    WHEN p_poll_type = 'poll_text'   THEN public.polls_hub_anon_voters_poll_text(p_game_id)
    ELSE 0
  END;
END;
$function$;


-- =========================
-- Helpers: close-ready (green)
-- =========================

CREATE OR REPLACE FUNCTION public.polls_hub_can_close_poll_text(p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  q record;
  sid uuid;
  uniq_cnt int;
BEGIN
  FOR q IN
    SELECT id FROM public.questions WHERE game_id = p_game_id ORDER BY ord
  LOOP
    SELECT ps.id
      INTO sid
    FROM public.poll_sessions ps
    WHERE ps.game_id = p_game_id AND ps.question_id = q.id
    ORDER BY ps.created_at DESC
    LIMIT 1;

    IF sid IS NULL THEN
      RETURN FALSE;
    END IF;

    SELECT count(DISTINCT btrim(e.answer_norm))::int
      INTO uniq_cnt
    FROM public.poll_text_entries e
    WHERE e.game_id = p_game_id
      AND e.question_id = q.id
      AND e.poll_session_id = sid
      AND NULLIF(btrim(e.answer_norm), '') IS NOT NULL;

    IF COALESCE(uniq_cnt, 0) < 3 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$;


-- poll_points: identyczna logika “mocnych” odpowiedzi jak w poll_points_close_and_normalize
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
    SELECT ps.id
      INTO sid
    FROM public.poll_sessions ps
    WHERE ps.game_id = p_game_id AND ps.question_id = q.id
    ORDER BY ps.created_at DESC
    LIMIT 1;

    IF sid IS NULL THEN
      RETURN FALSE;
    END IF;

    WITH counts AS (
      SELECT a.id AS answer_id,
             GREATEST(1, COALESCE(count(v.answer_id), 0))::int AS cnt
      FROM public.answers a
      LEFT JOIN public.poll_votes v
        ON v.answer_id = a.id
       AND v.game_id = p_game_id
       AND v.question_id = q.id
       AND v.poll_session_id = sid
      WHERE a.question_id = q.id
      GROUP BY a.id
    ),
    total AS (
      SELECT sum(cnt)::numeric AS s FROM counts
    ),
    raw AS (
      SELECT answer_id, cnt, (cnt / NULLIF((SELECT s FROM total), 0)) * 100 AS pct
      FROM counts
    ),
    floored AS (
      SELECT answer_id, cnt, pct, floor(pct)::int AS pts, (pct - floor(pct)) AS frac
      FROM raw
    ),
    sum_floor AS (
      SELECT sum(pts)::int AS s FROM floored
    ),
    diff AS (
      SELECT (100 - COALESCE((SELECT s FROM sum_floor), 0))::int AS d
    ),
    ranked AS (
      SELECT f.*,
             row_number() OVER (ORDER BY f.frac DESC, f.answer_id) AS rn
      FROM floored f
    ),
    distributed AS (
      SELECT
        answer_id,
        GREATEST(1, pts + CASE WHEN (SELECT d FROM diff) > 0 AND rn <= (SELECT d FROM diff) THEN 1 ELSE 0 END)::int AS p_final
      FROM ranked
    )
    SELECT count(*)::int INTO strong_cnt
    FROM distributed
    WHERE p_final >= 3;

    IF COALESCE(strong_cnt, 0) < 3 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$;


CREATE OR REPLACE FUNCTION public.polls_hub_can_close(p_game_id uuid, p_poll_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN CASE
    WHEN p_poll_type = 'poll_points' THEN public.polls_hub_can_close_poll_points(p_game_id)
    WHEN p_poll_type = 'poll_text'   THEN public.polls_hub_can_close_poll_text(p_game_id)
    ELSE FALSE
  END;
END;
$function$;


-- =========================
-- Replace RPC: polls_hub_list_polls
-- =========================

-- usuń starą definicję (nie da się zmienić RETURN TABLE przez OR REPLACE)
DROP FUNCTION IF EXISTS public.polls_hub_list_polls();

CREATE FUNCTION public.polls_hub_list_polls()
RETURNS TABLE(
  game_id uuid,
  name text,
  poll_type text,
  poll_state text,
  created_at timestamptz,
  tasks_active integer,
  tasks_done integer,
  anon_votes integer,
  close_ready boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- jeśli u Ciebie istnieje, zostaw; jeśli nie istnieje, usuń tę linię
  perform public.poll_claim_email_records();

  return query
  with g as (
    select
      gm.id as game_id,
      gm.name,
      gm.type as poll_type,
      case
        when gm.status = 'poll_open' then 'open'
        when gm.status = 'ready' then 'closed'
        else 'draft'
      end as poll_state,
      gm.created_at
    from public.games gm
    where gm.owner_id = auth.uid()
      and gm.type in ('poll_text','poll_points')
  ),
  t as (
    select
      pt.game_id,
      count(*) filter (where pt.done_at is null and pt.declined_at is null and pt.cancelled_at is null)::int as tasks_active,
      count(*) filter (where pt.done_at is not null)::int as tasks_done
    from public.poll_tasks pt
    where pt.owner_id = auth.uid()
    group by pt.game_id
  )
  select
    g.game_id,
    g.name,
    g.poll_type,
    g.poll_state,
    g.created_at,
    coalesce(t.tasks_active,0) as tasks_active,
    coalesce(t.tasks_done,0) as tasks_done,
    public.polls_hub_anon_voters(g.game_id, g.poll_type) as anon_votes,
    (g.poll_state = 'open') and public.polls_hub_can_close(g.game_id, g.poll_type) as close_ready
  from g
  left join t on t.game_id = g.game_id
  order by g.created_at desc;
end;
$function$;

COMMIT;
