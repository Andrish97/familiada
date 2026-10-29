-- ============================================================
-- 126: dodanie AWS SES jako providera emaili
-- Klucze i region są w zmiennych środowiskowych Edge Functions:
--   AWS_SES_ACCESS_KEY_ID
--   AWS_SES_SECRET_ACCESS_KEY
--   AWS_SES_REGION (odczytywany z env, NIE z tabeli)
-- Żeby aktywować SES: dodaj "ses" do provider_order w mail_settings
-- ============================================================

-- brak zmian w schemacie — tylko komentarz do provider_order
COMMENT ON COLUMN public.mail_settings.provider_order IS
  'Kolejność providerów: sendgrid, brevo, mailgun, ses. Oddzielone przecinkami.';
