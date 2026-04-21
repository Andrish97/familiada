-- Migration: Remove legacy AI settings trash
DROP FUNCTION IF EXISTS "public"."get_provider_order"();
DROP FUNCTION IF EXISTS "public"."update_ai_provider_order"(text);
DROP TABLE IF EXISTS "public"."ai_settings";
