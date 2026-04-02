-- 075: Reset is_marketing flag and only keep true marketing emails

-- Reset all is_marketing flags to false
UPDATE public.messages SET is_marketing = false WHERE is_marketing = true;

-- Only mark messages that were sent as BULK (multiple recipients with same content)
-- These are真正的 marketing emails sent from the marketing panel
UPDATE public.messages m
SET is_marketing = true
WHERE m.direction = 'outbound'
  AND m.body_html LIKE '%FAMILIADA%'
  AND m.body_html LIKE '%familiada.online%'
  AND EXISTS (
    SELECT 1 FROM public.messages m2
    WHERE m2.direction = 'outbound'
      AND m2.subject = m.subject
      AND m2.body_html = m.body_html
      AND m2.id != m.id
      AND m2.created_at BETWEEN m.created_at - interval '5 minutes' AND m.created_at + interval '5 minutes'
  );
