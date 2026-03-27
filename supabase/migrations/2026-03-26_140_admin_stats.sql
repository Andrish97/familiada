-- Migration: Add admin stats function
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
    total_games bigint;
    games_today bigint;
    total_polls bigint;
    total_votes bigint;
    total_ratings bigint;
    avg_rating numeric;
BEGIN
    -- Users stats (from auth.users via public.profiles for security/access)
    SELECT COUNT(*) INTO total_users FROM public.profiles;
    SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false;
    SELECT COUNT(*) INTO guest_users FROM public.profiles WHERE is_guest = true;

    -- Games stats
    SELECT COUNT(*) INTO total_games FROM public.games;
    SELECT COUNT(*) INTO games_today FROM public.games WHERE created_at >= CURRENT_DATE;

    -- Polls & Votes
    SELECT COUNT(*) INTO total_polls FROM public.poll_sessions;
    SELECT COUNT(*) INTO total_votes FROM public.poll_votes;

    -- Ratings
    SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
    SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;

    result := jsonb_build_object(
        'users', jsonb_build_object(
            'total', total_users,
            'confirmed', confirmed_users,
            'guests', guest_users
        ),
        'games', jsonb_build_object(
            'total', total_games,
            'today', games_today
        ),
        'activity', jsonb_build_object(
            'polls', total_polls,
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
