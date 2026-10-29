-- 1. Utworzenie tabeli email_providers
CREATE TABLE IF NOT EXISTS "public"."email_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL, -- techniczna nazwa np. 'sendgrid'
    "label" "text" NOT NULL, -- przyjazna nazwa np. 'SendGrid Główne'
    "priority" integer DEFAULT 0 NOT NULL,
    "daily_limit" integer DEFAULT 1000 NOT NULL,
    "rem_worker" integer DEFAULT 800 NOT NULL,
    "rem_immediate" integer DEFAULT 200 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_providers_pkey" PRIMARY KEY ("id")
);

-- 2. Włączenie RLS
ALTER TABLE "public"."email_providers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_providers_read_all" ON "public"."email_providers" FOR SELECT USING (true);
CREATE POLICY "email_providers_admin_all" ON "public"."email_providers" FOR ALL USING (true) WITH CHECK (true);

-- 3. Funkcja do resetowania limitów
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

-- Dodatkowe funkcje do dekrementacji limitów
CREATE OR REPLACE FUNCTION "public"."decrement_provider_immediate"(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.email_providers
    SET rem_immediate = GREATEST(0, rem_immediate - 1)
    WHERE id = p_id;
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
    WHERE id = p_id;
END;
$$;

-- 4. Rejestracja w pg_cron (o północy każdego dnia)
-- Uwaga: Wymaga rozszerzenia pg_cron włączonego w Supabase
SELECT cron.schedule('reset-email-limits-daily', '0 0 * * *', 'SELECT public.reset_email_limits()');

-- 5. Inicjalizacja danymi
INSERT INTO "public"."email_providers" (name, label, priority, daily_limit, rem_worker, rem_immediate)
VALUES 
('sendgrid', 'SendGrid', 1, 1000, 800, 200),
('brevo', 'Brevo', 2, 300, 240, 60),
('mailgun', 'Mailgun', 3, 500, 400, 100),
('sendpulse', 'SendPulse', 4, 500, 400, 100),
('mailerlite', 'MailerLite', 5, 500, 400, 100);
