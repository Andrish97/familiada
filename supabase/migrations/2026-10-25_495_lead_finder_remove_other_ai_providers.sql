-- Lead Finder używa wyłącznie DeepSeeka. Pozostaje jego rekord ze stanem
-- cooldownu, używany przez usługę i RPC; pozostałych dostawców usuwamy.
DELETE FROM public.marketing_ai_providers WHERE name <> 'deepseek';
