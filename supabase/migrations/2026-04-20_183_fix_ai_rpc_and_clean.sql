-- Migration: Final fix for AI providers and RPC naming
-- SUPERSEDES: 2026-04-19_182_remove_gemini_db.sql

-- 1. Fix data
UPDATE ai_settings SET provider_order = 'openrouter,groq';

-- 2. Create the RPC function that JS and Bot are looking for
CREATE OR REPLACE FUNCTION "public"."get_provider_order"()
RETURNS TABLE(provider_order text) AS $$
BEGIN
  RETURN QUERY SELECT s.provider_order FROM "public"."ai_settings" s LIMIT 1;
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION "public"."get_provider_order"() TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_provider_order"() TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_provider_order"() TO service_role;
