-- Migration: Remove gemini from ai_settings
UPDATE ai_settings 
SET provider_order = REPLACE(REPLACE(provider_order, ',gemini', ''), 'gemini,', '')
WHERE provider_order LIKE '%gemini%';

-- Safety: if gemini was the only one
UPDATE ai_settings 
SET provider_order = 'openrouter,groq'
WHERE provider_order = 'gemini' OR provider_order = '';
