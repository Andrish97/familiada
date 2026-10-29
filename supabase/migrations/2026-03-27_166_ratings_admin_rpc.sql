-- Migration: Admin RPC for fetching ratings with user info (bypasses RLS on profiles)
CREATE OR REPLACE FUNCTION "public"."get_ratings_admin"()
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  stars       smallint,
  comment     text,
  created_at  timestamptz,
  username    text,
  email       text
)
LANGUAGE "sql" SECURITY DEFINER
SET "search_path" TO 'public', 'auth'
AS $$
  SELECT
    r.id,
    r.user_id,
    r.stars,
    r.comment,
    r.created_at,
    p.username,
    p.email
  FROM public.app_ratings r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY r.created_at DESC;
$$;
