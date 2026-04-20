-- Migration: Final cleanup of AI providers
-- Set the order to only supported models, once and for all.
UPDATE ai_settings SET provider_order = 'openrouter,groq';
