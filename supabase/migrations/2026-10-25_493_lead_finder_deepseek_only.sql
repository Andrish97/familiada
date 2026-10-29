-- 493: Lead Finder używa wyłącznie DeepSeeka (decyzja użytkownika 2026-10-25).
-- Wybór i kolejność dostawców zniknęły z panelu, więc DeepSeek musi być
-- w tabeli i włączony; pozostali wyłączeni (usługa i tak ich nie woła).
-- Cooldown DeepSeeka (limit) bez zmian.
INSERT INTO public.marketing_ai_providers (name, label, priority, is_active)
VALUES ('deepseek', 'DeepSeek', 0, true)
ON CONFLICT (name) DO UPDATE SET is_active = true, priority = 0, updated_at = now();

UPDATE public.marketing_ai_providers
   SET is_active = false, updated_at = now()
 WHERE name <> 'deepseek' AND is_active;
