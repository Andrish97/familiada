-- Lokalny Postgres ze schema.sql i local-stubs.sql; wszystko w rollbacku.
\set ON_ERROR_STOP on
BEGIN;
TRUNCATE public.marketing_ai_providers;
INSERT INTO public.marketing_ai_providers
  (name, label, is_active, priority, cooldown_until, last_error, updated_at)
VALUES
  ('deepseek', 'DeepSeek', true, 0, now() + interval '1 hour', 'limit', now() - interval '1 day'),
  ('groq', 'Groq', false, 1, NULL, NULL, now()),
  ('anthropic', 'Anthropic', true, 2, NULL, NULL, now());
CREATE TEMP TABLE expected_deepseek AS
  SELECT * FROM public.marketing_ai_providers WHERE name = 'deepseek';

\ir ../../supabase/migrations/2026-10-25_495_lead_finder_remove_other_ai_providers.sql
\ir ../../supabase/migrations/2026-10-25_495_lead_finder_remove_other_ai_providers.sql

DO $$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.marketing_ai_providers), 'Pozostaje tylko DeepSeek';
  ASSERT NOT EXISTS (
    (SELECT * FROM public.marketing_ai_providers EXCEPT SELECT * FROM expected_deepseek)
    UNION ALL
    (SELECT * FROM expected_deepseek EXCEPT SELECT * FROM public.marketing_ai_providers)
  ), 'Rekord DeepSeeka, w tym cooldown i błąd, pozostaje bez zmian';
END $$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT FROM public.get_available_ai_providers()), 'Cooldown blokuje dostawcę';
  PERFORM public.set_ai_provider_cooldown('deepseek', -1, NULL);
  ASSERT (SELECT count(*) = 1 FROM public.get_available_ai_providers() WHERE name = 'deepseek'),
    'Po cooldownie dostępny tylko DeepSeek';
  PERFORM public.set_ai_provider_cooldown('deepseek', 120, 'limit-test');
  ASSERT NOT EXISTS (SELECT FROM public.get_available_ai_providers()), 'RPC ustawia nowy cooldown';
END $$;
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT cooldown_until > now() AND last_error = 'limit-test'
            FROM public.marketing_ai_providers WHERE name = 'deepseek'), 'RPC zachowuje stan limitu';
END $$;
ROLLBACK;
