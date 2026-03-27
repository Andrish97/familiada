-- Migration: Rebuild get_admin_stats — activity-focused metrics with time windows
CREATE OR REPLACE FUNCTION "public"."get_admin_stats"()
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public', 'auth'
AS $$
DECLARE
    result jsonb;

    -- Users
    total_users      bigint;
    confirmed_users  bigint;
    guest_users      bigint;
    users_new_today  bigint;
    users_new_7d     bigint;
    users_new_30d    bigint;
    users_pl bigint; users_en bigint; users_uk bigint;

    -- Games
    total_games   bigint;
    games_ready   bigint;
    games_new_7d  bigint;
    avg_questions numeric;

    -- Gameplay (display presence = gra otwarta na ekranie)
    played_today  bigint;
    played_7d     bigint;
    played_30d    bigint;
    buzzer_7d     bigint;

    -- Polls
    poll_sessions_7d  bigint;
    poll_votes_7d     bigint;
    poll_votes_total  bigint;

    -- Health
    mail_errors_24h bigint;

    -- Ratings
    total_ratings bigint;
    avg_rating    numeric;
BEGIN
    -- Users
    SELECT COUNT(*) INTO total_users     FROM public.profiles;
    SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false;
    SELECT COUNT(*) INTO guest_users     FROM public.profiles WHERE is_guest = true;
    SELECT COUNT(*) INTO users_new_today FROM public.profiles WHERE created_at >= CURRENT_DATE;
    SELECT COUNT(*) INTO users_new_7d    FROM public.profiles WHERE created_at >= now() - interval '7 days';
    SELECT COUNT(*) INTO users_new_30d   FROM public.profiles WHERE created_at >= now() - interval '30 days';

    BEGIN
        SELECT COUNT(*) INTO users_pl FROM public.profiles WHERE language = 'pl';
        SELECT COUNT(*) INTO users_en FROM public.profiles WHERE language = 'en';
        SELECT COUNT(*) INTO users_uk FROM public.profiles WHERE language = 'uk';
    EXCEPTION WHEN OTHERS THEN
        users_pl := 0; users_en := 0; users_uk := 0;
    END;

    -- Games
    SELECT COUNT(*) INTO total_games  FROM public.games;
    SELECT COUNT(*) INTO games_ready  FROM public.games WHERE status = 'ready';
    SELECT COUNT(*) INTO games_new_7d FROM public.games WHERE created_at >= now() - interval '7 days';
    SELECT COALESCE(ROUND(AVG(q_count), 1), 0) INTO avg_questions
        FROM (SELECT COUNT(*) AS q_count FROM public.questions GROUP BY game_id) AS sub;

    -- Gameplay: display i buzzer są obowiązkowe — display jako proxy "gra otwarta na ekranie"
    SELECT COUNT(DISTINCT game_id) INTO played_today FROM public.device_presence
        WHERE device_type = 'display' AND last_seen_at >= CURRENT_DATE;
    SELECT COUNT(DISTINCT game_id) INTO played_7d FROM public.device_presence
        WHERE device_type = 'display' AND last_seen_at >= now() - interval '7 days';
    SELECT COUNT(DISTINCT game_id) INTO played_30d FROM public.device_presence
        WHERE device_type = 'display' AND last_seen_at >= now() - interval '30 days';
    SELECT COUNT(DISTINCT game_id) INTO buzzer_7d FROM public.device_presence
        WHERE device_type = 'buzzer' AND last_seen_at >= now() - interval '7 days';

    -- Polls
    SELECT COUNT(*) INTO poll_sessions_7d FROM public.poll_sessions WHERE created_at >= now() - interval '7 days';
    SELECT COUNT(*) INTO poll_votes_7d    FROM public.poll_votes    WHERE created_at >= now() - interval '7 days';
    SELECT COUNT(*) INTO poll_votes_total FROM public.poll_votes;

    -- Health
    BEGIN
        SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue
            WHERE status = 'failed' AND updated_at >= now() - interval '24 hours';
    EXCEPTION WHEN OTHERS THEN
        mail_errors_24h := 0;
    END;

    -- Ratings
    SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
    SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;

    result := jsonb_build_object(
        'users', jsonb_build_object(
            'total',      total_users,
            'confirmed',  confirmed_users,
            'guests',     guest_users,
            'new_today',  users_new_today,
            'new_7d',     users_new_7d,
            'new_30d',    users_new_30d,
            'langs',      jsonb_build_object('pl', users_pl, 'en', users_en, 'uk', users_uk)
        ),
        'games', jsonb_build_object(
            'total',   total_games,
            'ready',   games_ready,
            'new_7d',  games_new_7d,
            'avg_q',   avg_questions
        ),
        'gameplay', jsonb_build_object(
            'played_today', played_today,
            'played_7d',    played_7d,
            'played_30d',   played_30d,
            'buzzer_7d',    buzzer_7d
        ),
        'polls', jsonb_build_object(
            'sessions_7d',  poll_sessions_7d,
            'votes_7d',     poll_votes_7d,
            'votes_total',  poll_votes_total
        ),
        'health', jsonb_build_object(
            'mail_errors', mail_errors_24h
        ),
        'ratings', jsonb_build_object(
            'total',   total_ratings,
            'average', avg_rating
        ),
        'timestamp', now()
    );

    RETURN result;
END;
$$;
