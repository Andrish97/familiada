-- Dodaj source.mode do demo_template_data które go nie mają
-- TEXT logo
UPDATE demo_template_data
SET payload = jsonb_set(
  payload,
  '{source}',
  '{"mode": "TEXT"}'::jsonb
)
WHERE slot IN ('logo_text')
  AND (payload->>'source' IS NULL OR payload->'source'->>'mode' IS NULL);

-- DRAW logo
UPDATE demo_template_data
SET payload = jsonb_set(
  payload,
  '{source}',
  '{"mode": "DRAW"}'::jsonb
)
WHERE slot IN ('logo_draw')
  AND (payload->>'source' IS NULL OR payload->'source'->>'mode' IS NULL);

-- IMAGE logo
UPDATE demo_template_data
SET payload = jsonb_set(
  payload,
  '{source}',
  '{"mode": "IMAGE"}'::jsonb
)
WHERE slot IN ('logo_image')
  AND (payload->>'source' IS NULL OR payload->'source'->>'mode' IS NULL);
