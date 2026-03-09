-- 2026-03-10_043_drop_user_flags_demo.sql
--
-- The user_flags.demo column is unused:
-- - JS functions getUserDemoFlag/setUserDemoFlag/resetUserDemoFlag were deleted
-- - demo seeding now happens via DB trigger (seed_demo_for_user)
-- - restore_my_demo RPC cleans up by is_demo flag on games/logos/bases
--
-- Remove the column and update handle_new_user to not reference it.

-- 1. Update handle_new_user: replace demo-referencing upsert with simple upsert
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public' AS $$
DECLARE
  v_email       text;
  v_username    text;
  v_is_guest    boolean;
  v_last_active timestamptz;
  v_expires_at  timestamptz;
  v_num         int;
  v_try         int := 0;
  v_lang        text;
BEGIN
  v_is_guest := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false);

  v_email := lower(coalesce(new.email, ''));
  IF v_email = '' AND v_is_guest THEN
    v_email := 'guest_' || replace(new.id::text, '-', '') || '@guest.local';
  END IF;

  v_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  IF v_username = '' THEN
    v_username := null;
  END IF;

  IF v_is_guest AND v_username IS NULL THEN
    LOOP
      v_num := 1 + floor(random() * 999999)::int;
      v_username := 'guest_' || lpad(v_num::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE lower(p.username) = lower(v_username)
          AND p.id <> new.id
      );
      v_try := v_try + 1;
      EXIT WHEN v_try > 100;
    END LOOP;

    IF v_try > 100 THEN
      v_username := 'guest_' || substr(replace(new.id::text, '-', ''), 1, 12);
    END IF;
  END IF;

  IF v_is_guest THEN
    v_last_active := now();
    v_expires_at  := now() + interval '5 days';
  ELSE
    v_last_active := null;
    v_expires_at  := null;
  END IF;

  INSERT INTO public.profiles (id, email, username, is_guest, guest_last_active_at, guest_expires_at)
  VALUES (new.id, v_email, v_username, v_is_guest, v_last_active, v_expires_at)
  ON CONFLICT (id) DO UPDATE
    SET email                = excluded.email,
        username             = coalesce(excluded.username, public.profiles.username),
        is_guest             = excluded.is_guest,
        guest_last_active_at = excluded.guest_last_active_at,
        guest_expires_at     = excluded.guest_expires_at;

  -- Ensure user_flags row exists (all columns use DB defaults)
  INSERT INTO public.user_flags (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Seed demo data for real (non-guest) users
  IF NOT v_is_guest THEN
    v_lang := lower(trim(coalesce(new.raw_user_meta_data->>'language', 'pl')));
    IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;
    BEGIN
      PERFORM public.seed_demo_for_user(new.id, v_lang);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: demo seed failed for % (lang=%): %',
        new.id, v_lang, sqlerrm;
    END;
  END IF;

  RETURN new;
END;
$$;

-- 2. Drop the unused demo column
ALTER TABLE public.user_flags DROP COLUMN IF EXISTS demo;
