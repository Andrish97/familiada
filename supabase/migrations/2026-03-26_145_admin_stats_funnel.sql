-- Migration: Enhance admin stats with funnel and retention
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
    
    -- Funnel
    users_no_games bigint;
    users_with_games_no_polls bigint;
    real_events_count bigint; -- sessions with > 5 votes
    
    -- Marketplace
    marketplace_copies bigint;
    top_market_game text;
    
    total_votes bigint;
    total_ratings bigint;
    avg_rating numeric;
BEGIN
    -- Basic Users
    SELECT COUNT(*) INTO total_users FROM public.profiles;
    SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false;
    SELECT COUNT(*) INTO guest_users FROM public.profiles WHERE is_guest = true;
    
    -- Active in last 24h (approx by games or profiles updated_at if available, fallback to 0 for now or join auth.users)
    -- For simplicity, let's check users who created games or polls in last 24h
    SELECT COUNT(DISTINCT owner_id) INTO active_24h 
    FROM public.games 
    WHERE updated_at >= (now() - interval '24 hours');

    -- Games
    SELECT COUNT(*) INTO total_games FROM public.games;
    SELECT COUNT(*) INTO games_today FROM public.games WHERE created_at >= CURRENT_DATE;
    SELECT COUNT(*) INTO marketplace_copies FROM public.games WHERE source_market_id IS NOT NULL;

    -- Funnel Logic
    -- 1. Registered users with 0 games
    SELECT COUNT(*) INTO users_no_games 
    FROM public.profiles p
    LEFT JOIN public.games g ON g.owner_id = p.id
    WHERE p.is_guest = false AND g.id IS NULL;

    -- 2. Users with games but 0 poll sessions
    SELECT COUNT(DISTINCT g.owner_id) INTO users_with_games_no_polls
    FROM public.games g
    LEFT JOIN public.poll_sessions ps ON ps.game_id = g.id
    WHERE ps.id IS NULL;

    -- 3. Real events (sessions with more than 5 votes)
    SELECT COUNT(DISTINCT poll_session_id) INTO real_events_count
    FROM public.poll_votes
    GROUP BY poll_session_id
    HAVING COUNT(*) > 5;
    
    -- Fix: real_events_count from the above is tricky in PLpgSQL. Let's do a simple count.
    SELECT COUNT(*) INTO real_events_count FROM (
        SELECT 1 FROM public.poll_votes GROUP BY poll_session_id HAVING COUNT(*) > 5
    ) as sub;

    -- Top Market Game
    SELECT mg.title INTO top_market_game
    FROM public.market_games mg
    JOIN public.games g ON g.source_market_id = mg.id
    GROUP BY mg.id, mg.title
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Ratings
    SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
    SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;
    
    -- Final Votes
    SELECT COUNT(*) INTO total_votes FROM public.poll_votes;

    result := jsonb_build_object(
        'users', jsonb_build_object(
            'total', total_users,
            'confirmed', confirmed_users,
            'guests', guest_users,
            'active_24h', active_24h,
            'no_games', users_no_games
        ),
        'games', jsonb_build_object(
            'total', total_games,
            'today', games_today,
            'from_market', marketplace_copies,
            'top_market_game', COALESCE(top_market_game, 'Brak')
        ),
        'funnel', jsonb_build_object(
            'tire_kickers', users_with_games_no_polls,
            'real_events', real_events_count
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
