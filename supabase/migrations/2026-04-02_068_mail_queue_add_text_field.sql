-- 068: mail_queue — add text field for plain text alternative

ALTER TABLE public.mail_queue ADD COLUMN IF NOT EXISTS "text" text;

-- Update existing rows: generate plain text from html for existing rows
UPDATE public.mail_queue 
SET "text" = REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(html, '<[^>]*>', ' ', 'g'),
      '&nbsp;', ' ', 'g'
    ),
    '&amp;', '&', 'g'
  ),
  '\s+', ' ', 'g'
)
WHERE "text" IS NULL AND html IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.mail_queue."text" IS 'Plain text alternative for email clients that do not support HTML (Apple Mail preview, etc.)';
