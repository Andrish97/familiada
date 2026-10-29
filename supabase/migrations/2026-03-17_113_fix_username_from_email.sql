-- 113: Do not auto-generate username from email for new accounts

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_email text;
    v_username text;
    v_is_guest boolean;
    v_last_active timestamptz;
    v_expires_at timestamptz;
    v_lang text;
begin
  v_email    := new.email;
  v_is_guest := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false);

  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name'
  );

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

  INSERT INTO public.user_flags (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  v_lang := lower(trim(coalesce(new.raw_user_meta_data->>'language', 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  BEGIN
    PERFORM public.seed_demo_for_user(new.id, v_lang);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: demo seed failed for % (lang=%): %',
      new.id, v_lang, sqlerrm;
  END;

  RETURN new;
END;
$$;
