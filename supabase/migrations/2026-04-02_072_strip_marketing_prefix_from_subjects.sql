-- 072: Strip [Marketing] prefix from existing message subjects

-- Update messages table - remove [Marketing] prefix from subjects
UPDATE public.messages
SET subject = regexp_replace(subject, '^\[Marketing\]\s*', '', 'i')
WHERE subject LIKE '[Marketing]%'
  AND direction = 'outbound';
