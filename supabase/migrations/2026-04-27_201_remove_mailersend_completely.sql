-- 201: Usunięcie mailersend, dodanie ZeptoMail oraz ujednolicenie is_active
-- SUPERSEDES: 2026-04-27_200_rename_mailerlite_to_mailersend.sql

-- 1. Usuwamy MailerSend / MailerLite z listy providerów
DELETE FROM public.email_providers WHERE name IN ('mailerlite', 'mailersend');

-- 2. Dodajemy ZeptoMail (Zoho) z domyślnym limitem 1000
-- Daily Limit: 1000, Worker: 800, Immediate: 200
INSERT INTO public.email_providers (name, label, priority, daily_limit, rem_worker, rem_immediate, is_active)
VALUES ('zeptomail', 'Zoho ZeptoMail', 5, 1000, 800, 200, true);

-- 3. Aktualizujemy kolejność w ustawieniach (usuwamy nieistniejące, dodajemy zeptomail na koniec jeśli go nie ma)
UPDATE public.mail_settings
SET provider_order = REPLACE(REPLACE(provider_order, 'mailerlite', 'zeptomail'), 'mailersend', 'zeptomail')
WHERE provider_order LIKE '%mailerlite%' OR provider_order LIKE '%mailersend%';

-- 4. Poprawiamy funkcje dekrementacji, aby działały tylko na AKTYWNYCH (is_active=true)
-- To zapobiega błędom, gdy UI pokazuje checkbox, ale system i tak odejmuje punkty
CREATE OR REPLACE FUNCTION "public"."decrement_provider_immediate"(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.email_providers
    SET rem_immediate = GREATEST(0, rem_immediate - 1)
    WHERE id = p_id AND is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."decrement_provider_worker"(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.email_providers
    SET rem_worker = GREATEST(0, rem_worker - 1)
    WHERE id = p_id AND is_active = true;
END;
$$;

-- 5. Poprawiamy funkcję resetowania limitów, aby nie resetowała nieaktywnych
CREATE OR REPLACE FUNCTION "public"."reset_email_limits"() 
RETURNS "void" 
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
BEGIN
    UPDATE "public"."email_providers"
    SET "rem_worker" = floor("daily_limit" * 0.8),
        "rem_immediate" = "daily_limit" - floor("daily_limit" * 0.8)
    WHERE "is_active" = true;
END;
$$;
