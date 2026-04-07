-- Dodajemy klucz do AI Groq
INSERT INTO lead_finder_config (key, value) VALUES ('groq_api_key', '')
ON CONFLICT (key) DO NOTHING;
