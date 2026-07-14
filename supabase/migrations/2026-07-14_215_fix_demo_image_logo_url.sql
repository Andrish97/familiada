-- Fix broken imageUrl in demo IMAGE logos
--
-- The previous demo imageUrl pointed to a user-specific file that no longer exists.
-- Replace with a stable static asset served from the app itself.

-- 1. Update existing user_logos (all users with demo IMAGE logo)
UPDATE user_logos
SET payload = jsonb_set(
  payload,
  '{source,imageUrl}',
  '"https://www.familiada.online/logo-editor/assets/demo-image.png"'
)
WHERE is_demo = true
  AND payload -> 'source' ->> 'mode' = 'IMAGE';

-- 2. Update demo_template_data so future seeds/restores also get the correct URL
UPDATE demo_template_data
SET payload = jsonb_set(
  payload,
  '{payload,source,imageUrl}',
  '"https://www.familiada.online/logo-editor/assets/demo-image.png"'
)
WHERE slot = 'logo_image';
