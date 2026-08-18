-- Trzy poprawki zgłoszone po przejrzeniu panelu:
-- 1) Tabela "Rozgrywki" nie pokazywała nic o postępie w finale — dane
--    (client_meta.final_step) już się zbierały, tylko nie były zwracane.
-- 2) "W trakcie" liczyło się jako aktywne przez 3h bez sygnału życia —
--    za długo jak na tę grę (typowa rozgrywka to 20-45 min); skrócone do 1h.
-- 3) "Niedomyślne ustawienia" porównywało tylko 6 pól z "advanced"
--    (mnożniki rund, finał) — rozszerzone o kolory/motyw/logo ekranu
--    końcowego, tryb wyboru pytań rund/finału i niestandardowy dźwięk.

CREATE OR REPLACE VIEW "public"."game_sessions_effective" WITH ("security_invoker"='true') AS
SELECT
  s.*,
  CASE
    WHEN s.ended_at IS NULL
     AND s.status IN ('started', 'playing')
     AND now() - s.last_seen_at > interval '1 hour'
    THEN 'abandoned'
    ELSE s.status
  END AS "effective_status"
FROM public.game_sessions s;


CREATE OR REPLACE FUNCTION "public"."get_admin_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];

  total_users      bigint;
  confirmed_users  bigint;
  guest_users      bigint;
  users_new_today  bigint;
  users_new_7d     bigint;
  users_new_30d    bigint;
  users_pl bigint; users_en bigint; users_uk bigint;

  total_games      bigint;
  games_ready      bigint;
  games_new_today  bigint;
  games_new_7d     bigint;
  games_new_30d    bigint;
  avg_questions    numeric;
  custom_settings_total bigint;

  played_today    bigint;
  played_7d       bigint;
  played_30d      bigint;
  finished_30d    bigint;
  abandoned_30d   bigint;
  in_progress     bigint;
  errors_30d      bigint;
  legacy_total    bigint;

  poll_sessions_7d  bigint;
  poll_votes_7d     bigint;
  poll_votes_total  bigint;

  bases_total    bigint;
  bases_new_today bigint;
  bases_new_7d   bigint;
  bases_new_30d  bigint;

  logos_total    bigint;
  logos_new_today bigint;
  logos_new_7d   bigint;
  logos_new_30d  bigint;

  mail_errors_24h  bigint;

  total_ratings    bigint;
  avg_rating       numeric;
  ratings_new_today bigint;
  ratings_new_7d   bigint;
  ratings_new_30d  bigint;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_excluded_users) INTO excluded_ids;

  -- Users
  SELECT COUNT(*) INTO total_users     FROM public.profiles WHERE NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO guest_users     FROM public.profiles WHERE is_guest = true  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_today FROM public.profiles WHERE created_at >= CURRENT_DATE                AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_7d    FROM public.profiles WHERE created_at >= now() - interval '7 days'  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_30d   FROM public.profiles WHERE created_at >= now() - interval '30 days' AND NOT (id = ANY(excluded_ids));

  SELECT COUNT(*) INTO users_pl FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'pl' AND NOT (u.id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_en FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'en' AND NOT (u.id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_uk FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'uk' AND NOT (u.id = ANY(excluded_ids));

  -- Games
  SELECT COUNT(*) INTO total_games      FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_ready      FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND status = 'ready' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_today  FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= CURRENT_DATE AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_7d     FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_30d    FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= now() - interval '30 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COALESCE(ROUND(AVG(q_count), 1), 0) INTO avg_questions
    FROM (SELECT COUNT(*) AS q_count FROM public.questions q
          JOIN public.games g ON g.id = q.game_id
          WHERE g.is_demo = false AND g.source_market_id IS NULL AND NOT (g.owner_id = ANY(excluded_ids))
          GROUP BY q.game_id) AS sub;

  -- Niedomyślne ustawienia: advanced (mnożniki/finał) + wygląd ekranu +
  -- tryb wyboru pytań + niestandardowy dźwięk (nie tylko finał/mnożniki)
  SELECT COUNT(*) INTO custom_settings_total FROM public.games g
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
      );

  -- Gameplay (game_sessions_effective — realne rozgrywki, WŁĄCZNIE z sesjami
  -- na grach demo: rozegranie gry to działanie użytkownika, nawet jeśli sama
  -- gra została mu dostarczona automatycznie)
  SELECT COUNT(*) INTO played_today FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.started_at >= CURRENT_DATE AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO played_7d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.started_at >= now() - interval '7 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO played_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO finished_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.effective_status = 'final' AND s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO abandoned_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.effective_status = 'abandoned' AND s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO in_progress FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.effective_status IN ('started', 'playing') AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO errors_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE COALESCE((s.client_meta->>'error_count')::int, 0) > 0 AND s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO legacy_total FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.status = 'legacy' AND NOT (g.owner_id = ANY(excluded_ids));

  -- Polls
  SELECT COUNT(*) INTO poll_sessions_7d FROM public.poll_sessions WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO poll_votes_7d    FROM public.poll_votes    WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO poll_votes_total FROM public.poll_votes;

  -- Question bases
  SELECT COUNT(*) INTO bases_total     FROM public.question_bases WHERE is_demo = false AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_today FROM public.question_bases WHERE is_demo = false AND created_at >= CURRENT_DATE AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_7d    FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_30d   FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '30 days' AND NOT (owner_id = ANY(excluded_ids));

  -- User logos (user_id — no is_active since migration 208)
  SELECT COUNT(*) INTO logos_total     FROM public.user_logos WHERE is_demo = false AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_today FROM public.user_logos WHERE is_demo = false AND created_at >= CURRENT_DATE AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_7d    FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_30d   FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '30 days' AND NOT (user_id = ANY(excluded_ids));

  -- Mail errors
  BEGIN
    SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue
      WHERE status = 'failed' AND updated_at >= now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    mail_errors_24h := 0;
  END;

  -- Ratings
  SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
  SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;
  SELECT COUNT(*) INTO ratings_new_today FROM public.app_ratings WHERE created_at >= CURRENT_DATE;
  SELECT COUNT(*) INTO ratings_new_7d    FROM public.app_ratings WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO ratings_new_30d   FROM public.app_ratings WHERE created_at >= now() - interval '30 days';

  result := jsonb_build_object(
    'timestamp', now(),
    'users', jsonb_build_object(
      'total', total_users,
      'confirmed', confirmed_users,
      'guest', guest_users,
      'new_today', users_new_today,
      'new_7d', users_new_7d,
      'new_30d', users_new_30d,
      'langs', jsonb_build_object('pl', users_pl, 'en', users_en, 'uk', users_uk)
    ),
    'games', jsonb_build_object(
      'total', total_games,
      'ready', games_ready,
      'new_today', games_new_today,
      'new_7d', games_new_7d,
      'new_30d', games_new_30d,
      'avg_q', avg_questions
    ),
    'custom_settings', jsonb_build_object(
      'total', custom_settings_total
    ),
    'gameplay', jsonb_build_object(
      'played_today', played_today,
      'played_7d', played_7d,
      'played_30d', played_30d,
      'finished_30d', finished_30d,
      'abandoned_30d', abandoned_30d,
      'in_progress', in_progress,
      'errors_30d', errors_30d,
      'legacy_total', legacy_total
    ),
    'polls', jsonb_build_object(
      'sessions_7d', poll_sessions_7d,
      'votes_7d', poll_votes_7d,
      'votes_total', poll_votes_total
    ),
    'bases', jsonb_build_object(
      'total', bases_total,
      'new_today', bases_new_today,
      'new_7d', bases_new_7d,
      'new_30d', bases_new_30d
    ),
    'logos', jsonb_build_object(
      'total', logos_total,
      'new_today', logos_new_today,
      'new_7d', logos_new_7d,
      'new_30d', logos_new_30d
    ),
    'health', jsonb_build_object(
      'mail_errors', mail_errors_24h
    ),
    'ratings', jsonb_build_object(
      'total', total_ratings,
      'average', avg_rating,
      'new_today', ratings_new_today,
      'new_7d', ratings_new_7d,
      'new_30d', ratings_new_30d
    )
  );

  RETURN result;
END;
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
