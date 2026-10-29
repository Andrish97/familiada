-- Migracja 235 nadpisała get_stats_detail kopiując pełne ciało funkcji ze
-- STAREJ wersji (migracja 231), która jeszcze filtrowała
-- "WHERE g.is_demo = false" w gałęzi 'custom_settings'. Migracja 232
-- (custom_settings_include_demo) już wcześniej usunęła ten filtr, żeby gry
-- demo (np. "DEMO — Preparowana" z niestandardowym roundMultipliers)
-- pokazywały się w "Niedomyślne ustawienia" — 235 przypadkowo to cofnęła.
-- Odtwarzamy funkcję raz jeszcze, tym razem łącząc obie poprawki: brak
-- filtra is_demo w 'custom_settings' (z 232) + nowe kolumny rounds_score_a/b
-- i final_points w 'gameplay' (z 235).

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
      WHERE NOT (g.owner_id = ANY(excluded_ids))
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
