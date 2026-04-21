-- Migration: Fix AI dynamic labels RPC
-- SUPERSEDES: 2026-04-20_184_ai_dynamic_labels.sql

-- 1. Ensure column exists (safety in case 184 partially worked)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_settings' AND column_name='provider_labels') THEN
        ALTER TABLE "public"."ai_settings" ADD COLUMN "provider_labels" JSONB DEFAULT '{"openrouter": "OpenRouter", "groq": "Groq", "deepseek": "DeepSeek"}'::jsonb;
    END IF;
END $$;

-- 2. DROP function before changing its return type
DROP FUNCTION IF EXISTS "public"."get_provider_order"();

-- 3. Create the function with correct return type
CREATE OR REPLACE FUNCTION "public"."get_provider_order"()
RETURNS TABLE(provider_order text, provider_labels jsonb) AS $$
BEGIN
  RETURN QUERY SELECT s.provider_order, s.provider_labels FROM "public"."ai_settings" s LIMIT 1;
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;

-- 4. Set default labels if they are missing
UPDATE "public"."ai_settings" 
SET "provider_labels" = '{"openrouter": "OpenRouter", "groq": "Groq", "deepseek": "DeepSeek"}'::jsonb
WHERE "provider_labels" IS NULL;

-- Grants
GRANT EXECUTE ON FUNCTION "public"."get_provider_order"() TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_provider_order"() TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_provider_order"() TO service_role;
