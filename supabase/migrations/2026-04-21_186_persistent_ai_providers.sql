-- Migration: Persistent AI Providers with cooldowns
CREATE TABLE IF NOT EXISTS "public"."marketing_ai_providers" (
    "name" "text" PRIMARY KEY, -- 'deepseek', 'groq', 'openrouter'
    "label" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "priority" integer DEFAULT 0,
    "cooldown_until" timestamptz,
    "last_error" text,
    "updated_at" timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE "public"."marketing_ai_providers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_ai_providers_all" ON "public"."marketing_ai_providers" FOR ALL USING (true) WITH CHECK (true);

-- Initial data
INSERT INTO "public"."marketing_ai_providers" (name, label, priority)
VALUES 
    ('deepseek', 'DeepSeek (Paid)', 1),
    ('openrouter', 'OpenRouter', 2),
    ('groq', 'Groq (Llama 3)', 3)
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label;

-- RPC to get available providers (not on cooldown, active, ordered by priority)
CREATE OR REPLACE FUNCTION "public"."get_available_ai_providers"()
RETURNS TABLE(name text, label text, cooldown_remains integer) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    p.name, 
    p.label,
    EXTRACT(EPOCH FROM (p.cooldown_until - now()))::integer as cooldown_remains
  FROM "public"."marketing_ai_providers" p
  WHERE p.is_active = true 
    AND (p.cooldown_until IS NULL OR p.cooldown_until < now())
  ORDER BY p.priority ASC;
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;

-- RPC to set cooldown
CREATE OR REPLACE FUNCTION "public"."set_ai_provider_cooldown"(p_name text, p_seconds integer, p_error text DEFAULT NULL)
RETURNS void AS $$
BEGIN
  UPDATE "public"."marketing_ai_providers"
  SET 
    cooldown_until = now() + (p_seconds || ' seconds')::interval,
    last_error = p_error,
    updated_at = now()
  WHERE name = p_name;
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;
