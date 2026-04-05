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

-- =============================================================
-- NAPRAWA restore_my_demo - kopiuj source z szablonu do user_logos
-- =============================================================

CREATE OR REPLACE FUNCTION "public"."restore_my_demo"("p_lang" "text" DEFAULT 'pl'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_lang text;
  v_tpl  jsonb;
  v_game_id uuid;
  v_q_ids uuid[];
  v_a_map jsonb;
  v_sess_ids uuid[];
  v_qi int;
  v_q jsonb;
  v_ai int;
  v_a jsonb;
  v_cfg record;
  v_logo_slot text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_lang := lower(trim(coalesce(p_lang, 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  -- Logos: remove tagged + old-style (matched by name from template)
  DELETE FROM public.user_logos
  WHERE user_id = v_uid
    AND (
      is_demo = true
      OR name IN (
        SELECT payload->>'name'
        FROM public.demo_template_data
        WHERE lang = v_lang
          AND slot IN ('logo_text', 'logo_draw', 'logo_image')
      )
    );

  -- Question bases: remove tagged + old-style (matched by name from template)
  DELETE FROM public.question_bases
  WHERE owner_id = v_uid
    AND (
      is_demo = true
      OR name IN (
        SELECT payload->'base'->>'name'
        FROM public.demo_template_data
        WHERE lang = v_lang AND slot = 'base'
      )
    );

  -- Games: remove tagged + old-style (matched by name from template)
  DELETE FROM public.games
  WHERE owner_id = v_uid
    AND (
      is_demo = true
      OR name IN (
        SELECT payload->'game'->>'name'
        FROM public.demo_template_data
        WHERE lang = v_lang
          AND slot IN (
            'poll_text_open', 'poll_text_closed',
            'poll_points_open', 'poll_points_closed',
            'prepared', 'poll_points_draft', 'poll_text_draft'
          )
      )
    );

  /* ── STEP 2: LOGOS ────────────────────────────────────────────────── */
  -- Demo logos are inserted with is_active=false to avoid violating the
  -- user_logos_one_active_per_user partial unique index.
  -- GLYPH logo (logo_text) - kopiuj CAŁY payload z source!
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
      -- Kopiuj payload z szablonu (zawiera layers + source)
      v_tpl->'payload'
    );
  END IF;

  -- PIX logos
  FOREACH v_logo_slot IN ARRAY ARRAY['logo_draw','logo_image'] LOOP
    SELECT payload INTO v_tpl
      FROM demo_template_data WHERE lang = v_lang AND slot = v_logo_slot;
    IF v_tpl IS NOT NULL THEN
      INSERT INTO user_logos (user_id, name, type, is_active, is_demo, payload)
      VALUES (p_uid, v_tpl->>'name', 'PIX_150x70', false, true, v_tpl->'payload');
    END IF;
  END LOOP;
END;
$$;
