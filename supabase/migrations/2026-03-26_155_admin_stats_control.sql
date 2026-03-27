-- Migration: Track gameplay (control panel usage)
CREATE OR REPLACE FUNCTION "public"."get_admin_stats"()
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public', 'auth'
AS $$
DECLARE
    result jsonb;
    total_users bigint;
    confirmed_users bigint;
    guest_users bigint;
    active_24h bigint;
    
    total_games bigint;
    games_today bigint;
    empty_games bigint;
    avg_questions numeric;
    
    -- Funnel & Behavior
    users_no_games bigint;
    users_with_games_no_polls bigint;
    real_events_count bigint;
    buzzer_users_count bigint;
    control_starts_count bigint; -- games that had a control device connected
    
    -- Marketplace
    marketplace_copies bigint;
    top_market_game text;
    
    -- Technical
    mail_errors_24h bigint;
    
    -- Languages
    users_pl bigint;
    users_en bigint;
    users_uk bigint;
    
    total_votes bigint;
    total_ratings bigint;
    avg_rating numeric;
BEGIN
    -- Basic Users
    SELECT COUNT(*) INTO total_users FROM public.profiles;
    SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false;
    SELECT COUNT(*) INTO guest_users FROM public.profiles WHERE is_guest = true;
    
    -- Active in last 24h (by updates to games)
    SELECT COUNT(DISTINCT owner_id) INTO active_24h 
    FROM public.games 
    WHERE updated_at >= (now() - interval '24 hours');

    -- Games
    SELECT COUNT(*) INTO total_games FROM public.games;
    SELECT COUNT(*) INTO games_today FROM public.games WHERE created_at >= CURRENT_DATE;
    SELECT COUNT(*) INTO empty_games FROM public.games g WHERE NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.game_id = g.id);
    SELECT COALESCE(ROUND(AVG(q_count), 1), 0) INTO avg_questions FROM (
        SELECT COUNT(*) as q_count FROM public.questions GROUP BY game_id
    ) as sub;

    -- Control Panel Usage (Real Gameplay Starts)
    -- We check device_presence for 'control' type. 
    -- Even if transient, it's our best indicator of someone clicking "Play".
    SELECT COUNT(DISTINCT game_id) INTO control_starts_count 
    FROM public.device_presence 
    WHERE device_type = 'control';

    -- Funnel Logic
    SELECT COUNT(*) INTO users_no_games 
    FROM public.profiles p
    LEFT JOIN public.games g ON g.owner_id = p.id
    WHERE p.is_guest = false AND g.id IS NULL;

    SELECT COUNT(DISTINCT g.owner_id) INTO users_with_games_no_polls
    FROM public.games g
    LEFT JOIN public.poll_sessions ps ON ps.game_id = g.id
    WHERE ps.id IS NULL;

    SELECT COUNT(*) INTO real_events_count FROM (
        SELECT 1 FROM public.poll_votes GROUP BY poll_session_id HAVING COUNT(*) > 5
    ) as sub;
    
    -- Buzzer usage
    SELECT COUNT(DISTINCT game_id) INTO buzzer_users_count 
    FROM public.device_presence 
    WHERE device_type = 'buzzer';

    -- Marketplace
    SELECT COUNT(*) INTO marketplace_copies FROM public.games WHERE source_market_id IS NOT NULL;
    SELECT mg.title INTO top_market_game FROM public.market_games mg JOIN public.games g ON g.source_market_id = mg.id GROUP BY mg.id, mg.title ORDER BY COUNT(*) DESC LIMIT 1;

    -- Languages
    BEGIN
        SELECT COUNT(*) INTO users_pl FROM public.profiles WHERE language = 'pl';
        SELECT COUNT(*) INTO users_en FROM public.profiles WHERE language = 'en';
        SELECT COUNT(*) INTO users_uk FROM public.profiles WHERE language = 'uk';
    EXCEPTION WHEN OTHERS THEN
        users_pl := 0; users_en := 0; users_uk := 0;
    END;

    -- Technical Health
    BEGIN
        SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue WHERE status = 'failed' AND updated_at >= (now() - interval '24 hours');
    EXCEPTION WHEN OTHERS THEN
        mail_errors_24h := 0;
    END;

    -- Ratings & Activity
    SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
    SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;
    SELECT COUNT(*) INTO total_votes FROM public.poll_votes;

    result := jsonb_build_object(
        'users', jsonb_build_object(
            'total', total_users,
            'confirmed', confirmed_users,
            'guests', guest_users,
            'active_24h', active_24h,
            'no_games', users_no_games,
            'langs', jsonb_build_object('pl', users_pl, 'en', users_en, 'uk', users_uk)
        ),
        'games', jsonb_build_object(
            'total', total_games,
            'today', games_today,
            'empty', empty_games,
            'avg_q', avg_questions,
            'from_market', marketplace_copies,
            'top_market_game', COALESCE(top_market_game, 'Brak')
        ),
        'funnel', jsonb_build_object(
            'tire_kickers', users_with_games_no_polls,
            'real_events', real_events_count,
            'buzzer_usage', buzzer_users_count,
            'control_usage', control_starts_count
        ),
        'health', jsonb_build_object(
            'mail_errors', mail_errors_24h
        ),
        'activity', jsonb_build_object(
            'votes', total_votes
        ),
        'ratings', jsonb_build_object(
            'total', total_ratings,
            'average', avg_rating
        ),
        'timestamp', now()
    );

    RETURN result;
END;
$$;
