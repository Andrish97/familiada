-- Migration 216: Fix demo IMAGE logo payload + remove is_active from seed function
--
-- 1. Replaces full payload for all demo IMAGE logos (user_logos + demo_template_data)
--    with calibrated source settings and new stable imageUrl.
-- 2. Fixes seed_demo_for_user: column is_active was dropped in migration 208.

-- ── 1. New inner payload (shared for all languages) ──────────────────────────

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
    "bits_b64": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//+AAAAAAAAAAAAAAAAAAAAAf///+AAAAAAAAAAAA+AAAAAAD/QC//+AAAAAAAAAAAfgAAAAAHAAAAH/4AAAAAAAAAAHwAAAAAMAAAAAP/gAAAAAAAABB8AAAAAAAAAAAA/8YAAAAAAAAg/AAAAAAAAAAAAD/hgAAAAAAAgPwAAAAAAAAAAAAf8OAAAAAAAwD4AAAAAAAAAAAAD/hwAAAAAAQA/AAAAAAAAAAAAA/8eAAAAAAYAfgAAAAAAAABAAAH/DgAAAAAIAH4AA/4Af8AP+AAB/48AAAAAMAB+AA//gf/4P/wAAf+HAAAAAEAgfgAf/4P//H/+AAH/jwAAAAGAwPwAP//H//z//wAB/4cAAAADBwD8AH9fz/P5/n8AA/+PAAAABg0A/AB+D8/B+fg/AAP/jwAAAAw6APwA/AffgPvwHwAH/w8AAAAYbAH4APwH3wD78B8AB/8eAAAAMNQB+AD4D98B8+A/AA/+HgAAAGO4AfgA+A/fAffgPwAf/jwAAADHYAH4AfgP/wH34D8AP/x8AAABjqAB+AHwD78D98A+AH/8eAAAAx3AA/AB8A+/A/fAPgD/+PAAAAI+gAPwAfgfvwPn4H4B//HwAAAGO4AD//34Pz+f5+D8A//j4AAADH0AA//9//4//+f//A//x8AAAAz3AAP//P/+H//j//gf/4+AAAAY+wAH//z//B//w//wP/8eAAAAGe0AB//4f/gH98H/4P/8fgMAADH+AAAAAA+AAA/APgP/+PgHgAAx6wAAAAAAAAAfgAAH//PwD4AAcf8AAAAAAAA//4AAH//HwB/AAGP9AAAAAAAAf/8AAH//n4B/gABh9wAAAAAAAH//AAH//n8B9wAAYf+AAAAAAAB//AAH//j8B8AAAHH/wAAAAAAAP/AAH//38B8AAABh/+AAAAAAAAAAAH//z+B4AAAAcP/gAAAAAAAAAEP//z+B8AAAAHD/+AAAAAAAAA4P//3+Z4AAAAA4f/4AAAAAAADwP//3+P4MAAAAOD//wAAAAAAvg////+H4HwAAADwf//gAAAAH/A////+B8DeAAAAeB///wAAL/+B////+CfD/gAAAHwP///////wH////8ABH/4AAAA+Af//////gP////8AAH/+AAAAHwB/////8B/////4AAf8fAAAAA/AA///9AD/////wAAf4DAAAAAD+AAAAAAv/////gAA/wAAAAAAAf4AAAAP//////AAD/AAAAAAAAB/48BX//////+AAD+AAAAAAAAAH/fD///////4AAP8AAAAAAAAAAP9Z///////AAAfwAAAAAAAAAAAb+f/////8AAC/AAAAAAAAAAAAAbj////+gAAH8AAAAAAAAAAAAAHwf///AAAA/gAAAAAAAAAAAAAA4AAAAAAAXwAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
  }$p$::jsonb;
BEGIN
  -- Update all demo IMAGE logos for existing users
  UPDATE user_logos
  SET payload = v_payload
  WHERE is_demo = true
    AND payload -> 'source' ->> 'mode' = 'IMAGE';

  -- Update demo_template_data for all languages (keep name/kind/v, replace inner payload)
  UPDATE demo_template_data
  SET payload = jsonb_set(payload, '{payload}', v_payload)
  WHERE slot = 'logo_image';
END $$;

-- ── 2. Fix seed_demo_for_user — remove is_active (dropped in migration 208) ──

CREATE OR REPLACE FUNCTION "public"."seed_demo_for_user"("p_uid" "uuid", "p_lang" "text" DEFAULT 'pl'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_lang       text;
  v_tpl        jsonb;
  v_base_id    uuid;
  v_cat_map    jsonb := '{}';
  v_tag_map    jsonb := '{}';
  v_bq_map     jsonb := '{}';
  v_game_id    uuid;
  v_q_ids      uuid[];
  v_a_map      jsonb;
  v_sess_ids   uuid[];
  v_cfg        RECORD;
  v_cat        jsonb;
  v_tag        jsonb;
  v_q          jsonb;
  v_a          jsonb;
  v_vote       jsonb;
  v_ctag       jsonb;
  v_qtag       jsonb;
  v_qi         int;
  v_ai         int;
  v_vi         int;
  v_pick       int;
  v_cat_id     uuid;
  v_tag_id     uuid;
  v_q_id       uuid;
  v_a_id       uuid;
  v_parent_id  uuid;
  v_sess_id    uuid;
  v_logo_slot  text;
  v_raw        text;
  v_norm       text;
BEGIN
  v_lang := lower(trim(coalesce(p_lang, 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  /* ── STEP 1: BASE ─────────────────────────────────────────────────── */
  SELECT payload INTO v_tpl FROM demo_template_data WHERE lang = v_lang AND slot = 'base';
  IF v_tpl IS NOT NULL THEN
    INSERT INTO question_bases (owner_id, name, is_demo)
    VALUES (p_uid, v_tpl->'base'->>'name', true)
    RETURNING id INTO v_base_id;

    FOR v_cat IN SELECT value FROM jsonb_array_elements(v_tpl->'categories') LOOP
      IF (v_cat->>'parent_id') IS NULL THEN
        INSERT INTO qb_categories (base_id, parent_id, name, ord)
        VALUES (v_base_id, NULL, v_cat->>'name', (v_cat->>'ord')::int)
        RETURNING id INTO v_cat_id;
        v_cat_map := v_cat_map || jsonb_build_object(v_cat->>'id', v_cat_id);
      END IF;
    END LOOP;
    FOR v_cat IN SELECT value FROM jsonb_array_elements(v_tpl->'categories') LOOP
      IF (v_cat->>'parent_id') IS NOT NULL THEN
        v_parent_id := (v_cat_map->>(v_cat->>'parent_id'))::uuid;
        INSERT INTO qb_categories (base_id, parent_id, name, ord)
        VALUES (v_base_id, v_parent_id, v_cat->>'name', (v_cat->>'ord')::int)
        RETURNING id INTO v_cat_id;
        v_cat_map := v_cat_map || jsonb_build_object(v_cat->>'id', v_cat_id);
      END IF;
    END LOOP;

    FOR v_tag IN SELECT value FROM jsonb_array_elements(v_tpl->'tags') LOOP
      INSERT INTO qb_tags (base_id, name, color, ord)
      VALUES (v_base_id, v_tag->>'name', v_tag->>'color', (v_tag->>'ord')::int)
      RETURNING id INTO v_tag_id;
      v_tag_map := v_tag_map || jsonb_build_object(v_tag->>'id', v_tag_id);
    END LOOP;

    FOR v_ctag IN SELECT value FROM jsonb_array_elements(v_tpl->'category_tags') LOOP
      INSERT INTO qb_category_tags (category_id, tag_id)
      VALUES ((v_cat_map->>(v_ctag->>'category_id'))::uuid, (v_tag_map->>(v_ctag->>'tag_id'))::uuid);
    END LOOP;

    FOR v_q IN SELECT value FROM jsonb_array_elements(v_tpl->'questions') LOOP
      v_cat_id := (v_cat_map->>(v_q->>'category_id'))::uuid;
      INSERT INTO qb_questions (base_id, category_id, ord, payload)
      VALUES (v_base_id, v_cat_id, (v_q->>'ord')::int, v_q->'payload')
      RETURNING id INTO v_q_id;
      v_bq_map := v_bq_map || jsonb_build_object(v_q->>'id', v_q_id);
    END LOOP;

    FOR v_qtag IN SELECT value FROM jsonb_array_elements(v_tpl->'question_tags') LOOP
      INSERT INTO qb_question_tags (question_id, tag_id)
      VALUES ((v_bq_map->>(v_qtag->>'question_id'))::uuid, (v_tag_map->>(v_qtag->>'tag_id'))::uuid);
    END LOOP;
  END IF;

  /* ── STEP 2: LOGOS ────────────────────────────────────────────────── */
  FOREACH v_logo_slot IN ARRAY ARRAY['logo_text', 'logo_draw', 'logo_image'] LOOP
    SELECT payload INTO v_tpl FROM demo_template_data WHERE lang = v_lang AND slot = v_logo_slot;
    IF v_tpl IS NOT NULL THEN
      INSERT INTO user_logos (user_id, name, type, is_demo, payload)
      VALUES (
        p_uid,
        v_tpl->>'name',
        CASE WHEN v_tpl->>'kind' = 'GLYPH' THEN 'GLYPH_30x10' ELSE 'PIX_150x70' END,
        true,
        v_tpl->'payload'
      );
    END IF;
  END LOOP;

  /* ── STEP 3: GAMES ────────────────────────────────────────────────── */
  FOR v_cfg IN
    SELECT * FROM (VALUES
      ('poll_text_open',     'poll_text'::game_type,   'poll_open'::game_status, true,  false),
      ('poll_text_closed',   'poll_text'::game_type,   'ready'::game_status,     false, false),
      ('poll_points_open',   'poll_points'::game_type, 'poll_open'::game_status, false, true),
      ('poll_points_closed', 'poll_points'::game_type, 'ready'::game_status,     false, false),
      ('prepared',           'prepared'::game_type,    'draft'::game_status,     false, false),
      ('poll_points_draft',  'poll_points'::game_type, 'draft'::game_status,     false, false),
      ('poll_text_draft',    'poll_text'::game_type,   'draft'::game_status,     false, false)
    ) AS t(slot, gtype, gstatus, is_text_open, is_points_open)
  LOOP
    SELECT payload INTO v_tpl FROM demo_template_data WHERE lang = v_lang AND slot = v_cfg.slot;
    CONTINUE WHEN v_tpl IS NULL;

    INSERT INTO games (owner_id, name, type, status, is_demo)
    VALUES (p_uid, v_tpl->'game'->>'name', v_cfg.gtype, v_cfg.gstatus, true)
    RETURNING id INTO v_game_id;

    v_q_ids := ARRAY[]::uuid[]; v_a_map := '{}'; v_sess_ids := ARRAY[]::uuid[];

    FOR v_qi IN 1..jsonb_array_length(v_tpl->'questions') LOOP
      v_q := (v_tpl->'questions')->(v_qi - 1);
      INSERT INTO questions (game_id, ord, text) VALUES (v_game_id, v_qi, v_q->>'text') RETURNING id INTO v_q_id;
      v_q_ids := array_append(v_q_ids, v_q_id);
      FOR v_ai IN 1..coalesce(jsonb_array_length(v_q->'answers'), 0) LOOP
        v_a := (v_q->'answers')->(v_ai - 1);
        INSERT INTO answers (question_id, ord, text, fixed_points)
        VALUES (v_q_id, v_ai, left(trim(v_a->>'text'), 17), coalesce((v_a->>'fixed_points')::int, 0))
        RETURNING id INTO v_a_id;
        v_a_map := v_a_map || jsonb_build_object((v_qi - 1)::text || ':' || (v_ai - 1)::text, v_a_id);
      END LOOP;
    END LOOP;

    IF v_cfg.is_text_open OR v_cfg.is_points_open THEN
      FOR v_qi IN 1..array_length(v_q_ids, 1) LOOP
        INSERT INTO poll_sessions (game_id, question_id, question_ord, is_open)
        VALUES (v_game_id, v_q_ids[v_qi], v_qi, true) RETURNING id INTO v_sess_id;
        v_sess_ids := array_append(v_sess_ids, v_sess_id);
      END LOOP;
    END IF;

    FOR v_vi IN 1..coalesce(jsonb_array_length(v_tpl->'votes'), 0) LOOP
      v_vote := (v_tpl->'votes')->(v_vi - 1);
      IF v_cfg.is_text_open THEN
        FOR v_qi IN 1..jsonb_array_length(v_vote->'answers_raw') LOOP
          v_raw := v_vote->'answers_raw'->>(v_qi - 1);
          INSERT INTO poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
          VALUES (v_game_id, v_sess_ids[v_qi], v_q_ids[v_qi], 'demo_seed_v' || lpad(v_vi::text, 4, '0'), v_raw, lower(regexp_replace(trim(v_raw), '\s+', ' ', 'g')));
        END LOOP;
      ELSIF v_cfg.is_points_open THEN
        FOR v_qi IN 1..jsonb_array_length(v_vote->'picks') LOOP
          v_pick := (v_vote->'picks'->>(v_qi - 1))::int;
          v_a_id := (v_a_map->>((v_qi - 1)::text || ':' || v_pick::text))::uuid;
          INSERT INTO poll_votes (game_id, question_ord, answer_ord, voter_token, poll_session_id, question_id, answer_id)
          VALUES (v_game_id, v_qi, v_pick + 1, 'demo_seed_v' || lpad(v_vi::text, 4, '0'), v_sess_ids[v_qi], v_q_ids[v_qi], v_a_id);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
