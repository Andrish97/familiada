-- 073: Add is_marketing flag to messages table

-- Add is_marketing column
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_marketing boolean DEFAULT false;

-- Index for faster marketing folder queries
CREATE INDEX IF NOT EXISTS idx_messages_marketing 
ON public.messages (direction, is_marketing, created_at)
WHERE deleted_at IS NULL AND is_marketing = true;

-- Tag existing marketing emails (outbound with FAMILIADA HTML branding)
UPDATE public.messages
SET is_marketing = true
WHERE direction = 'outbound'
  AND body_html LIKE '%FAMILIADA%'
  AND is_marketing = false;

-- Add comment
COMMENT ON COLUMN public.messages.is_marketing IS 'True for marketing/bulk emails sent from marketing panel';
