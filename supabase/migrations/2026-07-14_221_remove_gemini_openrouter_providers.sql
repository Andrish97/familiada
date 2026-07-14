-- Migration: Remove Gemini and OpenRouter from AI providers
DELETE FROM "public"."marketing_ai_providers" WHERE name IN ('gemini', 'openrouter');
