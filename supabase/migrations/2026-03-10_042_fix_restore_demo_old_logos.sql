-- 2026-03-10_042_fix_restore_demo_old_logos.sql
--
-- Fix: restore_my_demo deleted records only WHERE is_demo=true.
-- Users who had demo data created by the old JS-based seeding
-- (before is_demo column existed) had is_demo=false on those rows.
-- On re-seed logos hit user_logos_user_name_uniq (23505 / 409),
-- and old games/bases would remain as orphaned duplicates.
--
-- Fix: also delete by name matching demo template data for this lang.

CREATE OR REPLACE FUNCTION public.restore_my_demo(p_lang text DEFAULT 'pl')
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_uid  uuid := auth.uid();
  v_lang text;
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
          AND slot IN ('logo_text', 'logo_text_pix', 'logo_draw', 'logo_image')
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

  PERFORM public.seed_demo_for_user(v_uid, v_lang);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.restore_my_demo(text) TO authenticated;
