-- Migration 217: Ensure demo_template_data logo_image has correct bits_b64
--
-- Migration 216 replaced the full inner payload via jsonb_set(payload, '{payload}', v_payload).
-- If that path was wrong (e.g. outer payload key differs), bits_b64 was never written.
-- This migration directly sets bits_b64 inside the inner payload for all languages.

DO $$
DECLARE
  v_bits_b64 text := 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//+AAAAAAAAAAAAAAAAAAAAAf///+AAAAAAAAAAAA+AAAAAAD/QC//+AAAAAAAAAAAfgAAAAAHAAAAH/4AAAAAAAAAAHwAAAAAMAAAAAP/gAAAAAAAABB8AAAAAAAAAAAA/8YAAAAAAAAg/AAAAAAAAAAAAD/hgAAAAAAAgPwAAAAAAAAAAAAf8OAAAAAAAwD4AAAAAAAAAAAAD/hwAAAAAAQA/AAAAAAAAAAAAA/8eAAAAAAYAfgAAAAAAAABAAAH/DgAAAAAIAH4AA/4Af8AP+AAB/48AAAAAMAB+AA//gf/4P/wAAf+HAAAAAEAgfgAf/4P//H/+AAH/jwAAAAGAwPwAP//H//z//wAB/4cAAAADBwD8AH9fz/P5/n8AA/+PAAAABg0A/AB+D8/B+fg/AAP/jwAAAAw6APwA/AffgPvwHwAH/w8AAAAYbAH4APwH3wD78B8AB/8eAAAAMNQB+AD4D98B8+A/AA/+HgAAAGO4AfgA+A/fAffgPwAf/jwAAADHYAH4AfgP/wH34D8AP/x8AAABjqAB+AHwD78D98A+AH/8eAAAAx3AA/AB8A+/A/fAPgD/+PAAAAI+gAPwAfgfvwPn4H4B//HwAAAGO4AD//34Pz+f5+D8A//j4AAADH0AA//9//4//+f//A//x8AAAAz3AAP//P/+H//j//gf/4+AAAAY+wAH//z//B//w//wP/8eAAAAGe0AB//4f/gH98H/4P/8fgMAADH+AAAAAA+AAA/APgP/+PgHgAAx6wAAAAAAAAAfgAAH//PwD4AAcf8AAAAAAAA//4AAH//HwB/AAGP9AAAAAAAAf/8AAH//n4B/gABh9wAAAAAAAH//AAH//n8B9wAAYf+AAAAAAAB//AAH//j8B8AAAHH/wAAAAAAAP/AAH//38B8AAABh/+AAAAAAAAAAAH//z+B4AAAAcP/gAAAAAAAAAEP//z+B8AAAAHD/+AAAAAAAAA4P//3+Z4AAAAA4f/4AAAAAAADwP//3+P4MAAAAOD//wAAAAAAvg////+H4HwAAADwf//gAAAAH/A////+B8DeAAAAeB///wAAL/+B////+CfD/gAAAHwP///////wH////8ABH/4AAAA+Af//////gP////8AAH/+AAAAHwB/////8B/////4AAf8fAAAAA/AA///9AD/////wAAf4DAAAAAD+AAAAAAv/////gAA/wAAAAAAAf4AAAAP//////AAD/AAAAAAAAB/48BX//////+AAD+AAAAAAAAAH/fD///////4AAP8AAAAAAAAAAP9Z///////AAAfwAAAAAAAAAAAb+f/////8AAC/AAAAAAAAAAAAAbj////+gAAH8AAAAAAAAAAAAAHwf///AAAA/gAAAAAAAAAAAAAA4AAAAAAAXwAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  v_count int;
BEGIN
  -- Check how many rows exist
  SELECT count(*) INTO v_count FROM demo_template_data WHERE slot = 'logo_image';
  RAISE NOTICE 'demo_template_data logo_image rows: %', v_count;

  -- Directly set bits_b64 inside the inner payload object
  -- Structure: outer column payload -> { name, kind, v, payload: { h, w, bits_b64, format, source } }
  UPDATE demo_template_data
  SET payload = jsonb_set(payload, '{payload,bits_b64}', to_jsonb(v_bits_b64))
  WHERE slot = 'logo_image';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Updated % rows in demo_template_data', v_count;

  -- Also ensure existing is_demo IMAGE logos have bits_b64 (for users who restored after mig 216)
  UPDATE user_logos
  SET payload = jsonb_set(payload, '{bits_b64}', to_jsonb(v_bits_b64))
  WHERE is_demo = true
    AND payload -> 'source' ->> 'mode' = 'IMAGE'
    AND (payload ->> 'bits_b64' IS NULL OR payload ->> 'bits_b64' = '');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Updated % user_logos missing bits_b64', v_count;
END $$;
