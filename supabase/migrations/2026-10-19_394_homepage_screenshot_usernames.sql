-- Store the sample account name with the rest of the shared per-language fixtures.
WITH existing AS (
  SELECT key, value::jsonb AS config
  FROM public.app_config
  WHERE key = 'homepage_screenshot_fixtures_v1'
)
UPDATE public.app_config AS target
SET value = jsonb_set(
  existing.config,
  '{sharedFixtures}',
  COALESCE(existing.config->'sharedFixtures', '{}'::jsonb) || jsonb_build_object(
    'pl', COALESCE(existing.config#>'{sharedFixtures,pl}', '{}'::jsonb) || jsonb_build_object(
      'username', COALESCE(NULLIF(existing.config#>>'{sharedFixtures,pl,username}', ''), 'Jan Kowalski')
    ),
    'en', COALESCE(existing.config#>'{sharedFixtures,en}', '{}'::jsonb) || jsonb_build_object(
      'username', COALESCE(NULLIF(existing.config#>>'{sharedFixtures,en,username}', ''), 'John Smith')
    ),
    'uk', COALESCE(existing.config#>'{sharedFixtures,uk}', '{}'::jsonb) || jsonb_build_object(
      'username', COALESCE(NULLIF(existing.config#>>'{sharedFixtures,uk,username}', ''), 'Іван Петренко')
    )
  ),
  true
)::text
FROM existing
WHERE target.key = existing.key;
