-- 079: Update existing body_preview to strip CSS

-- Update existing messages to strip CSS from body_preview
UPDATE public.messages
SET body_preview = left(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        COALESCE(body_html, body),
        E'<style[^>]*>[\\s\\S]*?</style>',
        '',
        'gi'
      ),
      E'<[^>]+>',
      ' '
    ),
    E':[\\s]*[^;{}]+;',
    '',
    'gi'
  ),
  120
)
WHERE body_preview LIKE '%:root%' OR body_preview LIKE '%color-scheme%';
