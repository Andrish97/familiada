-- Panel admina pokazywał tylko połączony wynik końcowy (rundy + finał
-- zsumowane), co przy grach z finałem daje mylące liczby typu "100:700" —
-- wygląda na niemożliwe, dopóki nie wiadomo że to suma dwóch osobnych pul
-- punktów. Rozbijamy to na osobne kolumny: wynik samych rund i punkty
-- zdobyte w finale.

ALTER TABLE "public"."game_sessions"
  ADD COLUMN "rounds_score_a" integer,
  ADD COLUMN "rounds_score_b" integer,
  ADD COLUMN "final_points" integer;

ALTER TABLE "public"."game_sessions"
  ADD CONSTRAINT "game_sessions_rounds_scores_check"
    CHECK (("rounds_score_a" IS NULL OR "rounds_score_a" >= 0) AND ("rounds_score_b" IS NULL OR "rounds_score_b" >= 0));

ALTER TABLE "public"."game_sessions"
  ADD CONSTRAINT "game_sessions_final_points_check"
    CHECK ("final_points" IS NULL OR "final_points" >= 0);

DROP FUNCTION IF EXISTS "public"."game_session_end"("uuid", "text", "text", "text", integer, integer);

CREATE FUNCTION "public"."game_session_end"(
    "p_session_id" "uuid",
    "p_status" "text",
    "p_error_message" "text" DEFAULT NULL::"text",
    "p_winner_team" "text" DEFAULT NULL::"text",
    "p_team_a_score" integer DEFAULT NULL::integer,
    "p_team_b_score" integer DEFAULT NULL::integer,
    "p_rounds_score_a" integer DEFAULT NULL::integer,
    "p_rounds_score_b" integer DEFAULT NULL::integer,
    "p_final_points" integer DEFAULT NULL::integer
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
begin
  select g.owner_id into v_owner
  from public.game_sessions s
  join public.games g on g.id = s.game_id
  where s.id = p_session_id;

  if not found then raise exception 'session not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_sessions
  set
    ended_at = now(),
    last_seen_at = now(),
    status = p_status,
    error_message = coalesce(p_error_message, error_message),
    winner_team = coalesce(p_winner_team, winner_team),
    team_a_score = coalesce(p_team_a_score, team_a_score),
    team_b_score = coalesce(p_team_b_score, team_b_score),
    rounds_score_a = coalesce(p_rounds_score_a, rounds_score_a),
    rounds_score_b = coalesce(p_rounds_score_b, rounds_score_b),
    final_points = coalesce(p_final_points, final_points)
  where id = p_session_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_stats_detail"("p_type" "text", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  CASE p_type

  WHEN 'users' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        p.username,
        p.email,
        lower(u.raw_user_meta_data->>'language') AS language,
        p.is_guest,
        p.created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE NOT (p.id = ANY(excluded_ids))
      ORDER BY p.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'games' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name,
        g.type,
        g.status,
        pr.username AS owner,
        g.created_at
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE g.is_demo = false
        AND g.source_market_id IS NULL
        AND NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'custom_settings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name AS game_name,
        pr.username AS owner,
        g.created_at,
        g.settings->'game'->'advanced' AS advanced,
        g.settings->'display' AS display,
        g.settings->'game'->>'hasFinal' AS has_final,
        g.settings->'game'->>'finalQuestionsMode' AS final_questions_mode,
        g.settings->'game'->>'roundsQuestionsMode' AS rounds_questions_mode,
        g.settings->'sound' AS sound
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE g.is_demo = false
        AND NOT (g.owner_id = ANY(excluded_ids))
        AND (
          (g.settings->'game'->'advanced' IS NOT NULL
            AND g.settings->'game'->'advanced' <> '{}'::jsonb
            AND g.settings->'game'->'advanced' <> '{"roundMultipliers":[1,1,1,2,3],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"logo","finalPrizeMultiplier":3,"mainPrizeAmount":25000}'::jsonb)
          OR (g.settings->'display'->'colors' IS NOT NULL
            AND g.settings->'display'->'colors' <> '{"A":"#c4002f","B":"#2a62ff","BACKGROUND":"#d21180","DOT":"#d7ff3d"}'::jsonb)
          OR (g.settings->'display'->>'theme' IS NOT NULL)
          OR (g.settings->'display'->>'logoId' IS NOT NULL)
          OR (g.settings->'game'->>'hasFinal' IS NOT NULL)
          OR (g.settings->'game'->>'finalQuestionsMode' IS NOT NULL AND g.settings->'game'->>'finalQuestionsMode' <> 'random')
          OR (g.settings->'game'->>'roundsQuestionsMode' IS NOT NULL AND g.settings->'game'->>'roundsQuestionsMode' <> 'random')
          OR (g.settings->'sound' IS NOT NULL AND g.settings->'sound' <> '{}'::jsonb)
        )
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'gameplay' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name AS game_name,
        pr.username AS owner,
        s.started_at,
        s.ended_at,
        s.status,
        s.effective_status,
        s.rounds_played,
        s.winner_team,
        s.team_a_score,
        s.team_b_score,
        s.rounds_score_a,
        s.rounds_score_b,
        s.final_points,
        s.client_meta->>'final_step' AS final_step,
        COALESCE((s.client_meta->>'error_count')::int, 0) AS error_count
      FROM public.game_sessions_effective s
      JOIN public.games g ON g.id = s.game_id
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY s.started_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'bases' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        b.name,
        pr.username AS owner,
        b.created_at
      FROM public.question_bases b
      LEFT JOIN public.profiles pr ON pr.id = b.owner_id
      WHERE b.is_demo = false
        AND NOT (b.owner_id = ANY(excluded_ids))
      ORDER BY b.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'logos' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        l.name,
        l.type,
        pr.username AS owner,
        l.created_at
      FROM public.user_logos l
      LEFT JOIN public.profiles pr ON pr.id = l.user_id
      WHERE l.is_demo = false
        AND NOT (l.user_id = ANY(excluded_ids))
      ORDER BY l.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'ratings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        pr.username,
        rt.stars,
        rt.comment,
        rt.created_at
      FROM public.app_ratings rt
      LEFT JOIN public.profiles pr ON pr.id = rt.user_id
      ORDER BY rt.created_at DESC
      LIMIT p_limit
    ) r;

  ELSE
    result := '[]'::jsonb;
  END CASE;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
