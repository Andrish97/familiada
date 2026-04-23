-- Usunięcie kolumn, które zostały zastąpione nową tabelą email_providers
ALTER TABLE "public"."mail_settings" 
DROP COLUMN IF EXISTS "provider_order",
DROP COLUMN IF EXISTS "queue_enabled";
