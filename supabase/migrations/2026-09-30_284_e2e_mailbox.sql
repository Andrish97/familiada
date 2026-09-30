-- Prywatna skrzynka dla prawdziwych kont E2E test1..test13.
-- Dostęp ma wyłącznie maintenance-worker przez service_role.

CREATE TABLE IF NOT EXISTS public.e2e_emails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient   text NOT NULL,
  from_email  text,
  subject     text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  body_html   text,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT e2e_emails_recipient_check
    CHECK (recipient ~ '^test([1-9]|1[0-3])@familiada\.online$')
);

CREATE INDEX IF NOT EXISTS e2e_emails_recipient_received_idx
  ON public.e2e_emails (recipient, received_at DESC);
CREATE INDEX IF NOT EXISTS e2e_emails_expires_idx
  ON public.e2e_emails (expires_at);

ALTER TABLE public.e2e_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.e2e_emails FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.e2e_emails TO service_role;

COMMENT ON TABLE public.e2e_emails IS
  'Krotkozyjaca skrzynka testow E2E; brak dostepu anon/authenticated, TTL 24h.';
