-- AI Provider Settings table (for lead-finder)
CREATE TABLE IF NOT EXISTS "public"."ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_order" "text" DEFAULT 'ollama,openrouter,groq'::"text" NOT NULL,
    "ollama_url" "text" DEFAULT 'http://ollama:11434'::"text",
    "ollama_model" "text" DEFAULT 'llama3.2:3b'::"text",
    "created_at" "timestamp with time zone" DEFAULT "now"(),
    "updated_at" "timestamp with time zone" DEFAULT "now"(),
    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_settings_all" ON "public"."ai_settings" FOR ALL USING (true) WITH CHECK (true);

-- Insert default settings if not exists
INSERT INTO "public"."ai_settings" ("provider_order", "ollama_url", "ollama_model")
SELECT 'ollama,openrouter,groq', 'http://ollama:11434', 'llama3.2:3b'
WHERE NOT EXISTS (SELECT 1 FROM "public"."ai_settings" LIMIT 1);

CREATE OR REPLACE FUNCTION "public"."get_ai_settings"()
RETURNS "public"."ai_settings" AS $$
  SELECT * FROM "public"."ai_settings" LIMIT 1;
$$ LANGUAGE "sql" SECURITY DEFINER;

CREATE OR REPLACE FUNCTION "public"."update_ai_provider_order"(p_order text)
RETURNS void AS $$
  UPDATE "public"."ai_settings" SET "provider_order" = p_order, "updated_at" = now() LIMIT 1;
$$ LANGUAGE "sql" SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION "public"."get_ai_settings"() TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_ai_settings"() TO service_role;
GRANT EXECUTE ON FUNCTION "public"."update_ai_provider_order"(text) TO anon;
GRANT EXECUTE ON FUNCTION "public"."update_ai_provider_order"(text) TO service_role;
