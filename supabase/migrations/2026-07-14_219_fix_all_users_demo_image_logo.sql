-- Migration 219: Update ALL users' demo IMAGE logo to the correct payload
--
-- Migration 218 only matched logos where payload->'source'->>'mode'='IMAGE'.
-- Old logos seeded before migration 098 may not have that field.
-- This migration matches by name against demo_template_data slot='logo_image'
-- (covers all languages: pl/en/uk) so no demo IMAGE logo is missed.

DO $$
DECLARE
  v_payload jsonb := $p${
    "h": 70,
    "w": 150,
    "format": "BITPACK_MSB_FIRST_ROW_MAJOR",
    "source": {
      "crop": {
        "h": 0.32142857142857145,
        "w": 0.6072647399902343,
        "x": 0.18968677789666819,
        "y": 0.3347371799343235
      },
      "mode": "IMAGE",
      "black": 58,
      "gamma": 0.94,
      "white": 100,
      "bright": 0,
      "invert": true,
      "contrast": 1,
      "imageUrl": "https://www.familiada.online/logo-editor/assets/demo-image.png",
      "ditherAmt": 0.8,
      "imageData": null
    },
    "bits_b64": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAAAAAAAAAAAAAAAAAAAAP///AAAAAAAAAAAAAAAAAAAAA/////AAAAAAAAAAAB+AAAAAAH+AAf/+AAAAAAAAAAAfgAAAAAOAAAAD/4AAAAAAAAAAHwAAAAAMAAAAAP/gAAAAAAAABB8AAAAAAAAAAAA/8YAAAAAAABg/AAAAAAAAAAAAD/xgAAAAAABAPwAAAAAAAAAAAAf8OAAAAAAAgD4AAAAAAAAAAAAD/hwAAAAAAgB/AAAAAAAAAAAAA/8OAAAAAAQAPgAAIAAEAAFAAAH/DgAAAAAYAH4AA/4Af8AP+AAB/48AAAAAIAB+AA//gf/4P/4AAf+PAAAAAEBgfgAf/4P//H/+AAH/hwAAAAGBQPwAP//H//z//wAB/48AAAADBoD8AH9fz+v5/X8AA/+PAAAABhsA/AB+D8/A+fg/AAP/jwAAAAwtAPwA/AffgPvwHwAH/w8AAAAYdAH4APwH3wD78B8AB/8eAAAAMNgB+AD4D98B8+A/AA/+HgAAAGOoAfgA+A/fAffgPwAf/jwAAADHcAH4AfgPvwH34D8AP/x8AAABjsAB+AHwD78D98A+AH/8eAAAAx1gA/AB8A+/A/fAPgD/+PAAAAI/gAPwAfgfvwPn4H4B//HgAAAGOoAD//34Pz+/5+D8A//j4AAADH2AA//9//4//+f//A//x8AAAAz2gAP//P/+H//j//gf/4+AAAAY+wAH//z//B//w//wf/4+AAAAGe4AB//4f/gH98H/4P/8fAMAADH7AAEkkA/AAA/APwP/+PgHgAAx7gAAAAAAAAAfgAAH//PwD4AAcf8AAAAAAAA//4AAH//HwB/AAGP3AAAAAAAAf/+AAH//n4B/gABh/wAAAAAAAH//AAH//n8B9wAAYf+AAAAAAAB//AAH//j8B8AAAHH/wAAAAAAAP/AAH//3+B8AAABh/8AAAAAAAAAAAH//z+B8AAAAcP/wAAAAAAAAACP//7+B8AAAAHD/+AAAAAAAAA4P//7+R4AAAAA4f/4AAAAAAABwP//z+P4EAAAAOD//wAAAAAAXgf///+H4HwAAADwf//gAAAAD/g////+B8DeAAAAcD///oAAK//B////+CfD/gAAAHwP///////4D////8ABD/4AAAA+A///////gH////8AAH/+AAAAHwB/////8A/////8AAP8fAAAAA/AA///+AD/////wAAf4DgAAAAH8AACoAAv/////wAA/wAAAAAAAf4AAAAH//////AAB/gAAAAAAAB/w8AF//////+AAD/AAAAAAAAAP/fD///////4AAP8AAAAAAAAAAP9Z///////AAAfwAAAAAAAAAAAb+f/////8AAB/gAAAAAAAAAAAAbj/////AAAH8AAAAAAAAAAAAAHwf///gAAAfwAAAAAAAAAAAAAB4AVUgAAAL4AAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
  }$p$::jsonb;
  v_count int;
BEGIN
  UPDATE user_logos
  SET payload = v_payload
  WHERE is_demo = true
    AND name IN (
      SELECT payload ->> 'name'
      FROM demo_template_data
      WHERE slot = 'logo_image'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'user_logos (demo IMAGE, all users) updated: % rows', v_count;
END $$;
