-- 243: restore_my_demo — drop the legacy "match by name" fallback
--
-- restore_my_demo used to delete rows matching `is_demo = true OR name IN
-- (demo template names)`. The name-match branch was a backward-compat
-- fallback for old accounts predating a reliable `is_demo` flag (see
-- 2026-04-03_096, comment "old-style (matched by name from template)").
-- It has an unwanted side effect: it also deletes a user's own,
-- completely unrelated (is_demo = false) game/base/logo if its current
-- name happens to collide with a demo template name.
--
-- Confirmed in the live DB: no rows currently rely on the name-match
-- fallback (nothing with is_demo = false whose name matches a template
-- would need it) — safe to drop. Any old row that DID depend on it was
-- already self-healed the first time restore_my_demo ran for that user
-- since April (the reseed always sets is_demo = true correctly).

CREATE OR REPLACE FUNCTION public.restore_my_demo(p_lang text DEFAULT 'pl'::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_lang text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_lang := lower(trim(coalesce(p_lang, 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  DELETE FROM public.user_logos WHERE user_id = v_uid AND is_demo = true;
  DELETE FROM public.question_bases WHERE owner_id = v_uid AND is_demo = true;
  DELETE FROM public.games WHERE owner_id = v_uid AND is_demo = true;

  PERFORM public.seed_demo_for_user(v_uid, v_lang);
END;
$$;
