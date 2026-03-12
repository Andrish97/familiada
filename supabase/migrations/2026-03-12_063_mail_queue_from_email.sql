-- 063: mail_queue — add from_email column for per-email sender override

ALTER TABLE public.mail_queue ADD COLUMN IF NOT EXISTS from_email text;
