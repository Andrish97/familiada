-- Migration: Add labels to AI settings and make UI fully dynamic
ALTER TABLE IF EXISTS "public"."ai_settings" 
ADD COLUMN IF NOT EXISTS "provider_labels" JSONB DEFAULT '{"openrouter": "OpenRouter", "groq": "Groq", "deepseek": "DeepSeek"}'::jsonb;

-- Update the get_provider_order RPC to return both columns
CREATE OR REPLACE FUNCTION "public"."get_provider_order"()
RETURNS TABLE(provider_order text, provider_labels jsonb) AS $$
BEGIN
  RETURN QUERY SELECT s.provider_order, s.provider_labels FROM "public"."ai_settings" s LIMIT 1;
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;

-- Update existing row with default labels if missing
UPDATE "public"."ai_settings" 
SET "provider_labels" = '{"openrouter": "OpenRouter", "groq": "Groq", "deepseek": "DeepSeek"}'::jsonb
WHERE "provider_labels" IS NULL;
