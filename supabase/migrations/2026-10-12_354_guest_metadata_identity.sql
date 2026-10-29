-- E19: editable metadata must not promote an anonymous guest.
BEGIN;
DO $$ BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   LOCK auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.profiles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.friendships IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_subscriptions IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_tasks IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.mail_cooldowns IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.1);
 END LOOP;
END $$;
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

  -- If still missing (common for anonymous guests), generate a guest_XXX name
  IF v_username IS NULL OR v_username = '' THEN
    IF v_is_guest THEN
      v_username := 'guest_' || substr(replace(new.id::text, '-', ''), 1, 8);
    ELSE
      -- For non-guests we really expect a name, but as a fallback use a slice of UUID
      v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
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
CREATE OR REPLACE FUNCTION public._poll_identity_regular(p_uid uuid, p_identity jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT NOT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id=p_uid),
   coalesce(p_identity->>'is_anonymous','false')='true' OR coalesce(p_identity->'raw_user_meta_data'->>'is_guest','false')='true')
 AND NOT(coalesce(p_identity->>'is_anonymous','false')='true' AND
   ((p_identity->>'email_confirmed_at') IS NULL OR public._norm_email(p_identity->>'email') IS NULL));
$function$;
CREATE OR REPLACE FUNCTION public._guest_identity_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE guest boolean;
BEGIN
 guest:=coalesce(NEW.raw_user_meta_data->>'is_guest','false')='true';
 IF TG_OP='UPDATE' THEN
  SELECT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id=NEW.id),guest) INTO guest;
 END IF;
 guest:=guest OR (coalesce(NEW.is_anonymous,false) AND (NEW.email_confirmed_at IS NULL OR nullif(trim(NEW.email),'') IS NULL));
 NEW.raw_user_meta_data:=coalesce(NEW.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('is_guest',guest);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._guest_identity_metadata() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS auth_guest_identity_metadata ON auth.users;
CREATE TRIGGER auth_guest_identity_metadata BEFORE INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public._guest_identity_metadata();

-- Only actual anonymous identities without a verified mailbox. Do not change
-- genuine confirmed conversions or normal registrations. Give repaired legacy
-- guests the normal five-day period from repair; never delete data here.
UPDATE public.profiles p SET is_guest=true,
 guest_last_active_at=coalesce(p.guest_last_active_at,now()),
 guest_expires_at=coalesce(p.guest_expires_at,now()+interval '5 days')
FROM auth.users u WHERE u.id=p.id AND coalesce(u.is_anonymous,false)
 AND (u.email_confirmed_at IS NULL OR nullif(trim(u.email),'') IS NULL)
 AND (p.is_guest IS DISTINCT FROM true OR p.guest_expires_at IS NULL);
UPDATE auth.users u SET raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb)||'{"is_guest":true}'::jsonb
WHERE coalesce(u.is_anonymous,false)
 AND (u.email_confirmed_at IS NULL OR nullif(trim(u.email),'') IS NULL)
 AND (u.raw_user_meta_data->>'is_guest') IS DISTINCT FROM 'true';
COMMIT;
