-- SUPERSEDES: 2026-04-16_168_fix_update_function.sql
-- SUPERSEDES: 2026-04-16_167_fix_ai_provider_settings.sql
-- SUPERSEDES: 2026-04-16_166_ai_provider_settings.sql
-- Create AI settings table and function (fix all previous errors)

CREATE TABLE IF NOT EXISTS "public"."ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_order" "text" DEFAULT 'ollama,openrouter,groq'::"text" NOT NULL,
    "ollama_url" "text" DEFAULT 'http://familiada-ollama:11434'::"text",
    "ollama_model" "text" DEFAULT 'llama3.2:3b'::"text",
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_settings_all" ON "public"."ai_settings";
CREATE POLICY "ai_settings_all" ON "public"."ai_settings" FOR ALL USING (true) WITH CHECK (true);

INSERT INTO "public"."ai_settings" ("provider_order", "ollama_url", "ollama_model")
SELECT 'ollama,openrouter,groq', 'http://familiada-ollama:11434', 'llama3.2:3b'
WHERE NOT EXISTS (SELECT 1 FROM "public"."ai_settings" LIMIT 1);

DROP FUNCTION IF EXISTS "public"."update_ai_provider_order"(text);
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
