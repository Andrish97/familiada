\set ON_ERROR_STOP on

CREATE TABLE public.demo_template_data (
  lang text NOT NULL,
  slot text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (lang, slot)
);
CREATE TABLE public.user_logos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_demo boolean NOT NULL,
  payload jsonb NOT NULL
);

CREATE TEMP TABLE old_draw_payload AS
SELECT '{"w":150,"h":70,"format":"BITPACK_MSB_FIRST_ROW_MAJOR","bits_b64":"AA==","source":{"mode":"DRAW"}}'::jsonb AS payload;

INSERT INTO public.demo_template_data (lang, slot, payload)
SELECT lang, 'logo_draw', jsonb_build_object(
  'v', 1,
  'kind', 'PIX',
  'name', CASE lang WHEN 'pl' THEN 'DEMO - Logo Rysunek' WHEN 'en' THEN 'DEMO - Drawing Logo' ELSE 'DEMO - Логотип малюнок' END,
  'payload', old.payload
)
FROM (VALUES ('pl'), ('en'), ('uk')) AS languages(lang)
CROSS JOIN old_draw_payload AS old;

-- Three untouched demo copies should update; edited and non-demo rows should not.
INSERT INTO public.user_logos (is_demo, payload)
SELECT true, old.payload
FROM (VALUES ('pl'), ('en'), ('uk')) AS languages(lang)
CROSS JOIN old_draw_payload AS old
UNION ALL
SELECT true, payload || '{"edited":true}'::jsonb FROM old_draw_payload
UNION ALL
SELECT false, payload FROM old_draw_payload;

\ir ../../supabase/migrations/2026-10-09_317_demo_draw_shared_host_png.sql

DO $$
DECLARE
  v_asset text := 'https://www.familiada.online/logo/assets/demo-draw-host.png?v=20261009-demo-draw';
BEGIN
  IF (SELECT count(*) FROM public.demo_template_data
      WHERE slot = 'logo_draw'
        AND payload #>> '{payload,source,hostRasterUrl}' = v_asset
        AND payload #> '{payload,source,hostRasterData}' IS NULL
        AND payload #> '{payload,source,fabricData,objects}' IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'Expected all three DRAW templates to use the shared PNG and retain the Fabric scene';
  END IF;

  IF (SELECT count(*) FROM public.user_logos
      WHERE is_demo IS TRUE
        AND payload #>> '{source,hostRasterUrl}' = v_asset
        AND payload #> '{source,hostRasterData}' IS NULL
        AND payload #> '{source,fabricData,objects}' IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'Expected only the three untouched demo copies to be replaced';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_logos WHERE is_demo IS TRUE AND payload ? 'edited' AND payload #> '{source,hostRasterUrl}' IS NULL) THEN
    RAISE EXCEPTION 'The edited demo logo was unexpectedly changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_logos WHERE is_demo IS FALSE AND payload #> '{source,hostRasterUrl}' IS NULL) THEN
    RAISE EXCEPTION 'A non-demo logo was unexpectedly changed';
  END IF;
END
$$;

SELECT 'demo DRAW shared PNG migration OK' AS result;
