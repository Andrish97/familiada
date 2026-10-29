-- 516: rejestracja z nazwą e2e.<role><NN> dla adresu tej tożsamości testowej.
-- 514 zerowała w handle_new_user każdą zastrzeżoną nazwę, także tę, którą
-- profiles_reserve_test_username (460) dopuszcza dla adresu tożsamości -- konto
-- testowe zakładane ponownie formularzem lądowało na wyborze nazwy (przebieg
-- 40904647836, ankieta351/353). Reszta funkcji bez zmian względem 514.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_email text;
    v_username text;
    v_is_guest boolean;
    v_last_active timestamptz;
    v_expires_at timestamptz;
    v_lang text;
begin
  v_email    := new.email;
  v_is_guest := coalesce(new.raw_user_meta_data->>'is_guest','false')='true' OR
    (coalesce(new.is_anonymous,false) AND (new.email_confirmed_at IS NULL OR nullif(trim(new.email),'') IS NULL));

  -- Try to get username from metadata or email
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );

  -- Nazwa niezgodna z zasadami, zastrzeżona albo zajęta: konto bez nazwy
  -- (wcześniej unikalny indeks przerywał rejestrację).
  IF v_username IS NOT NULL AND v_username <> '' AND NOT v_is_guest AND (
       v_username !~ '^[a-zA-Z0-9_.-]{3,20}$'
       OR lower(v_username) LIKE 'guest\_%'
       OR (public.reserved_username_reason(v_username) IS NOT NULL
           -- jak profiles_reserve_test_username (460): e2e.<role><NN> tylko
           -- dla adresu tej tożsamości testowej
           AND NOT (public.reserved_username_reason(v_username) = 'test' AND EXISTS (
             SELECT 1 FROM public.e2e_identities i
             WHERE i.name = lower(btrim(v_username)) AND i.role IN ('standard','disposable','dedicated')
               AND lower(new.email) IN (i.email, replace(i.email,'@','.new@')))))
       OR EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(v_username) AND p.id <> new.id)) THEN
    v_username := NULL;
  END IF;

  -- If still missing (common for anonymous guests), generate a guest_XXX name
  IF (v_username IS NULL OR v_username = '') AND v_is_guest THEN
    v_username := 'guest_' || substr(replace(new.id::text, '-', ''), 1, 8);
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
$function$;
