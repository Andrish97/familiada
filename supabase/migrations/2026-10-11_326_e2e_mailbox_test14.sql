-- test14 to skrzynka bez konta, kierowana do Workera jak pozostałe adresy E2E.
-- Poszerzenie allowlisty; prawa dostępu i TTL pozostają bez zmian.
BEGIN;
ALTER TABLE public.e2e_emails DROP CONSTRAINT e2e_emails_recipient_check;
ALTER TABLE public.e2e_emails ADD CONSTRAINT e2e_emails_recipient_check
  CHECK (recipient ~ '^test([1-9]|1[0-4])@familiada\.online$');
COMMIT;
