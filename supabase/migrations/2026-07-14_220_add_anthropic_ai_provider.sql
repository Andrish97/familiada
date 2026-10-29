-- Migration: Add Anthropic (Claude) as AI provider for lead finder
INSERT INTO "public"."marketing_ai_providers" (name, label, priority)
VALUES ('anthropic', 'Anthropic Claude', 4)
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label;
