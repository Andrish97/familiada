-- Migration: Backfill is_demo=true for old-style demo records
-- created before the is_demo column existed (JS-based seeding had no flag).
-- Matches by name against demo_template_data, same logic as restore_my_demo.

-- Games
UPDATE public.games
SET is_demo = true
WHERE is_demo = false
  AND name IN (
    SELECT payload->'game'->>'name'
    FROM public.demo_template_data
    WHERE slot IN (
      'poll_text_open', 'poll_text_closed',
      'poll_points_open', 'poll_points_closed',
      'prepared', 'poll_points_draft', 'poll_text_draft'
    )
  );

-- Question bases
UPDATE public.question_bases
SET is_demo = true
WHERE is_demo = false
  AND name IN (
    SELECT payload->'base'->>'name'
    FROM public.demo_template_data
    WHERE slot = 'base'
  );

-- Logos
UPDATE public.user_logos
SET is_demo = true
WHERE is_demo = false
  AND name IN (
    SELECT payload->>'name'
    FROM public.demo_template_data
    WHERE slot IN ('logo_text', 'logo_text_pix', 'logo_draw', 'logo_image')
  );
