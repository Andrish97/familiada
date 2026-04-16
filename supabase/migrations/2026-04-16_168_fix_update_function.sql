-- SUPERSEDES: 2026-04-16_167_fix_ai_provider_settings.sql
-- Fix update function

CREATE OR REPLACE FUNCTION "public"."update_ai_provider_order"(p_order text)
RETURNS void AS $$
BEGIN
  UPDATE "public"."ai_settings" 
  SET "provider_order" = p_order, "updated_at" = now()
  WHERE id IN (SELECT id FROM "public"."ai_settings" LIMIT 1);
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION "public"."update_ai_provider_order"(text) TO anon;
GRANT EXECUTE ON FUNCTION "public"."update_ai_provider_order"(text) TO service_role;
