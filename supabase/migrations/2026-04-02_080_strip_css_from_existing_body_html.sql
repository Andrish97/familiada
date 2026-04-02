-- 080: Strip CSS from existing body and body_html columns

-- Update existing messages to strip <style> blocks from body_html
UPDATE public.messages
SET body_html = regexp_replace(
  body_html,
  E'<style[^>]*>[\\s\\S]*?</style>',
  '',
  'gi'
)
WHERE body_html LIKE '%<style%';

-- Note: We can't update body_preview because it's not a real column
-- It's generated on-the-fly by list_messages function (fixed in #078)
-- Old emails will show CSS in preview until they're deleted or updated
