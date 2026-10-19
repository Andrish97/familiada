-- Keep the logo page and all of its public code/assets under /logos/.
-- Existing saved demo logos can still contain the former static asset URLs.
BEGIN;

UPDATE public.user_logos
SET payload = replace(payload::text, '/logo/assets/', '/logos/assets/')::jsonb
WHERE payload::text LIKE '%/logo/assets/%';

UPDATE public.demo_template_data
SET payload = replace(payload::text, '/logo/assets/', '/logos/assets/')::jsonb
WHERE payload::text LIKE '%/logo/assets/%';

UPDATE public.app_config
SET value = replace(value, '/logo/assets/', '/logos/assets/')
WHERE value LIKE '%/logo/assets/%';

COMMIT;
