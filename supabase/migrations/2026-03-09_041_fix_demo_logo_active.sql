-- 2026-03-09_041_fix_demo_logo_active.sql
--
-- Fix: seed_demo_for_user inserted all demo logos with is_active=true,
-- but user_logos_one_active_per_user is a partial unique index that allows
-- only ONE active logo per user. The second insert caused a 409 Conflict.
--
-- Fix: demo logos are now inserted with is_active=false.

CREATE OR REPLACE FUNCTION public.seed_demo_for_user(
  p_uid  uuid,
  p_lang text DEFAULT 'pl'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
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
  SELECT payload INTO v_tpl
    FROM demo_template_data WHERE lang = v_lang AND slot = 'base';
  IF v_tpl IS NULL THEN
    RAISE WARNING 'seed_demo_for_user: no base template for lang=%', v_lang;
    RETURN;
  END IF;

  INSERT INTO question_bases (owner_id, name, is_demo)
  VALUES (p_uid, v_tpl->'base'->>'name', true)
  RETURNING id INTO v_base_id;

  -- Root categories first
  FOR v_cat IN SELECT value FROM jsonb_array_elements(v_tpl->'categories') LOOP
    IF (v_cat->>'parent_id') IS NULL THEN
      INSERT INTO qb_categories (base_id, parent_id, name, ord)
      VALUES (v_base_id, NULL, v_cat->>'name', (v_cat->>'ord')::int)
      RETURNING id INTO v_cat_id;
      v_cat_map := v_cat_map || jsonb_build_object(v_cat->>'id', v_cat_id);
    END IF;
  END LOOP;

  -- Child categories
  FOR v_cat IN SELECT value FROM jsonb_array_elements(v_tpl->'categories') LOOP
    IF (v_cat->>'parent_id') IS NOT NULL THEN
      v_parent_id := (v_cat_map->>(v_cat->>'parent_id'))::uuid;
      INSERT INTO qb_categories (base_id, parent_id, name, ord)
      VALUES (v_base_id, v_parent_id, v_cat->>'name', (v_cat->>'ord')::int)
      RETURNING id INTO v_cat_id;
      v_cat_map := v_cat_map || jsonb_build_object(v_cat->>'id', v_cat_id);
    END IF;
  END LOOP;

  -- Tags
  FOR v_tag IN SELECT value FROM jsonb_array_elements(v_tpl->'tags') LOOP
    INSERT INTO qb_tags (base_id, name, color, ord)
    VALUES (v_base_id, v_tag->>'name', v_tag->>'color', (v_tag->>'ord')::int)
    RETURNING id INTO v_tag_id;
    v_tag_map := v_tag_map || jsonb_build_object(v_tag->>'id', v_tag_id);
  END LOOP;

  -- Category tags
  FOR v_ctag IN SELECT value FROM jsonb_array_elements(v_tpl->'category_tags') LOOP
    INSERT INTO qb_category_tags (category_id, tag_id)
    VALUES (
      (v_cat_map->>(v_ctag->>'category_id'))::uuid,
      (v_tag_map->>(v_ctag->>'tag_id'))::uuid
    );
  END LOOP;

  -- Questions
  FOR v_q IN SELECT value FROM jsonb_array_elements(v_tpl->'questions') LOOP
    v_cat_id := (v_cat_map->>(v_q->>'category_id'))::uuid;
    INSERT INTO qb_questions (base_id, category_id, ord, payload)
    VALUES (v_base_id, v_cat_id, (v_q->>'ord')::int, v_q->'payload')
    RETURNING id INTO v_q_id;
    v_bq_map := v_bq_map || jsonb_build_object(v_q->>'id', v_q_id);
  END LOOP;

  -- Question tags
  FOR v_qtag IN SELECT value FROM jsonb_array_elements(v_tpl->'question_tags') LOOP
    INSERT INTO qb_question_tags (question_id, tag_id)
    VALUES (
      (v_bq_map->>(v_qtag->>'question_id'))::uuid,
      (v_tag_map->>(v_qtag->>'tag_id'))::uuid
    );
  END LOOP;

  /* ── STEP 2: LOGOS ────────────────────────────────────────────────── */
  -- Demo logos are inserted with is_active=false to avoid violating the
  -- user_logos_one_active_per_user partial unique index.
  -- GLYPH logo (logo_text)
  SELECT payload INTO v_tpl
    FROM demo_template_data WHERE lang = v_lang AND slot = 'logo_text';
  IF v_tpl IS NOT NULL THEN
    INSERT INTO user_logos (user_id, name, type, is_active, is_demo, payload)
    VALUES (
      p_uid,
      v_tpl->>'name',
      'GLYPH_30x10',
      false,
      true,
      jsonb_build_object('layers', jsonb_build_array(
        jsonb_build_object('rows', v_tpl->'payload'->'rows')
      ))
    );
  END IF;

  -- PIX logos
  FOREACH v_logo_slot IN ARRAY ARRAY['logo_text_pix','logo_draw','logo_image'] LOOP
    SELECT payload INTO v_tpl
      FROM demo_template_data WHERE lang = v_lang AND slot = v_logo_slot;
    IF v_tpl IS NOT NULL THEN
      INSERT INTO user_logos (user_id, name, type, is_active, is_demo, payload)
      VALUES (p_uid, v_tpl->>'name', 'PIX_150x70', false, true, v_tpl->'payload');
    END IF;
  END LOOP;

  /* ── STEP 3: GAMES ────────────────────────────────────────────────── */
  -- is_text_open  = poll_text with status poll_open  → answers_raw votes
  -- is_points_open= poll_points with status poll_open → picks votes
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
    SELECT payload INTO v_tpl
      FROM demo_template_data WHERE lang = v_lang AND slot = v_cfg.slot;
    CONTINUE WHEN v_tpl IS NULL;

    INSERT INTO games (owner_id, name, type, status, is_demo)
    VALUES (p_uid, v_tpl->'game'->>'name', v_cfg.gtype, v_cfg.gstatus, true)
    RETURNING id INTO v_game_id;

    v_q_ids    := ARRAY[]::uuid[];
    v_a_map    := '{}';
    v_sess_ids := ARRAY[]::uuid[];

    -- Questions + answers
    FOR v_qi IN 1..jsonb_array_length(v_tpl->'questions') LOOP
      v_q := (v_tpl->'questions')->(v_qi - 1);

      INSERT INTO questions (game_id, ord, text)
      VALUES (v_game_id, v_qi, v_q->>'text')
      RETURNING id INTO v_q_id;
      v_q_ids := array_append(v_q_ids, v_q_id);

      -- Answers (skipped automatically when array is empty / missing)
      FOR v_ai IN 1..coalesce(jsonb_array_length(v_q->'answers'), 0) LOOP
        v_a := (v_q->'answers')->(v_ai - 1);
        INSERT INTO answers (question_id, ord, text, fixed_points)
        VALUES (
          v_q_id,
          v_ai,
          left(trim(v_a->>'text'), 17),
          coalesce((v_a->>'fixed_points')::int, 0)
        )
        RETURNING id INTO v_a_id;
        v_a_map := v_a_map || jsonb_build_object(
          (v_qi - 1)::text || ':' || (v_ai - 1)::text, v_a_id
        );
      END LOOP;
    END LOOP;

    -- Poll sessions for open games
    IF v_cfg.is_text_open OR v_cfg.is_points_open THEN
      FOR v_qi IN 1..array_length(v_q_ids, 1) LOOP
        INSERT INTO poll_sessions (game_id, question_id, question_ord, is_open)
        VALUES (v_game_id, v_q_ids[v_qi], v_qi, true)
        RETURNING id INTO v_sess_id;
        v_sess_ids := array_append(v_sess_ids, v_sess_id);
      END LOOP;
    END IF;

    -- Votes
    FOR v_vi IN 1..coalesce(jsonb_array_length(v_tpl->'votes'), 0) LOOP
      v_vote := (v_tpl->'votes')->(v_vi - 1);

      IF v_cfg.is_text_open THEN
        -- answers_raw[] → poll_text_entries
        FOR v_qi IN 1..jsonb_array_length(v_vote->'answers_raw') LOOP
          v_raw  := v_vote->'answers_raw'->>(v_qi - 1);
          v_norm := lower(regexp_replace(trim(v_raw), '\s+', ' ', 'g'));
          INSERT INTO poll_text_entries
            (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
          VALUES (
            v_game_id,
            v_sess_ids[v_qi],
            v_q_ids[v_qi],
            'demo_seed_v' || lpad(v_vi::text, 4, '0'),
            v_raw,
            v_norm
          );
        END LOOP;

      ELSIF v_cfg.is_points_open THEN
        -- picks[] → poll_votes
        FOR v_qi IN 1..jsonb_array_length(v_vote->'picks') LOOP
          v_pick := (v_vote->'picks'->>(v_qi - 1))::int;
          v_a_id := (v_a_map->>((v_qi - 1)::text || ':' || v_pick::text))::uuid;
          INSERT INTO poll_votes
            (game_id, question_ord, answer_ord, voter_token,
             poll_session_id, question_id, answer_id)
          VALUES (
            v_game_id,
            v_qi,
            v_pick + 1,
            'demo_seed_v' || lpad(v_vi::text, 4, '0'),
            v_sess_ids[v_qi],
            v_q_ids[v_qi],
            v_a_id
          );
        END LOOP;
      END IF;
    END LOOP;

  END LOOP; -- games

END;
$func$;
