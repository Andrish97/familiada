DO $$
DECLARE
  v_asset constant text := 'https://www.familiada.online/logo/assets/demo-draw-host.png?v=20261009-demo-draw';
  v_templates integer;
  v_user_logos integer;
BEGIN
  SELECT count(*) INTO v_templates
    FROM public.demo_template_data
   WHERE slot = 'logo_draw'
     AND payload #>> '{payload,source,hostRasterUrl}' = v_asset
     AND payload #> '{payload,source,hostRasterData}' IS NULL
     AND payload #> '{payload,source,fabricData,objects}' IS NOT NULL;
  IF v_templates <> 3 THEN
    RAISE EXCEPTION 'Expected 3 shared DRAW demo templates, found %', v_templates;
  END IF;

  SELECT count(*) INTO v_user_logos
    FROM public.user_logos
   WHERE is_demo IS TRUE
     AND payload #>> '{source,hostRasterUrl}' = v_asset
     AND payload #> '{source,hostRasterData}' IS NULL
     AND payload #> '{source,fabricData,objects}' IS NOT NULL;
  IF v_user_logos = 0 THEN
    RAISE EXCEPTION 'No existing user demo DRAW logos reference the shared PNG';
  END IF;

  RAISE NOTICE 'Shared demo DRAW PNG verified: % templates and % existing user logos', v_templates, v_user_logos;
END
$$;
