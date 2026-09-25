-- Migration 270: kadr demo „DEMO - Logo Obraz” w nowym formacie (v:2)
--
-- Edytor logo (tryb obraz) zapisuje teraz kadr względem OBRAZU:
--   crop = { v: 2, x, y, w }  — ułamki 0–1 szerokości/wysokości obrazu,
--   wysokość ramki wynika z proporcji wyświetlacza 26:11.
-- Stary format (x,w / szerokość pola, y,h / wysokość pola edytora) zależał
-- od rozmiaru pola w chwili zapisu — po otwarciu na innym ekranie ramka
-- traciła proporcje i obejmowała inny fragment obrazu.
--
-- Wartości wyznaczone dopasowaniem do zapisanych kropek demo (bits_b64 bez
-- zmian): kadr 26:11 x=0.1825, y=0.2923, w=0.6183 obrazu demo-image.png
-- (1536×1024) odtwarza obecny wygląd logo.
--
-- Zmieniany jest tylko source.crop. Kopie demo użytkowników — tylko te,
-- które nadal mają stary kadr (bez "v"), żeby nie nadpisać kadru, który
-- ktoś już ustawił i zapisał w nowym formacie.

DO $$
DECLARE
  v_crop jsonb := '{"v": 2, "x": 0.1825, "y": 0.2923, "w": 0.6183}'::jsonb;
  v_count int;
BEGIN
  UPDATE demo_template_data
  SET payload = jsonb_set(payload, '{payload,source,crop}', v_crop)
  WHERE slot = 'logo_image'
    AND payload #> '{payload,source}' IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'demo_template_data logo_image: crop v2 — % rows', v_count;

  UPDATE user_logos
  SET payload = jsonb_set(payload, '{source,crop}', v_crop)
  WHERE is_demo = true
    AND payload -> 'source' ->> 'mode' = 'IMAGE'
    AND payload -> 'source' ->> 'imageUrl' LIKE '%/logo-editor/assets/demo-image.png'
    AND (payload #> '{source,crop,v}') IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'user_logos (demo IMAGE, stary kadr): crop v2 — % rows', v_count;
END $$;
