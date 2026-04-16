-- SUPERSEDES: 2026-04-16_169_fix_ai_settings_complete.sql
-- SUPERSEDES: 2026-04-16_168_fix_update_function.sql
-- SUPERSEDES: 2026-04-16_167_fix_ai_provider_settings.sql
-- SUPERSEDES: 2026-04-16_166_ai_provider_settings.sql
-- Fix: recreate ai_settings with only provider_order

DROP TABLE IF EXISTS "public"."ai_settings";

CREATE TABLE "public"."ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_order" "text" DEFAULT 'openrouter,groq'::"text" NOT NULL,
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_settings_all" ON "public"."ai_settings" FOR ALL USING (true) WITH CHECK (true);

INSERT INTO "public"."ai_settings" ("provider_order")
SELECT 'openrouter,groq'
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
