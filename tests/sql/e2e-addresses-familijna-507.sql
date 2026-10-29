\set ON_ERROR_STOP 1
-- 507: adresy e2e na familijna.app. Uruchamiać po migracji 507 na bazie,
-- w której przed migracją były konta e2e+...@familiada.online.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.e2e_identities WHERE email ~ 'familiada') THEN RAISE EXCEPTION 'identity_old_domain'; END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) ~ '^e2e\+.*@familiada\.online$') THEN RAISE EXCEPTION 'user_old_domain'; END IF;
 IF EXISTS (SELECT 1 FROM auth.identities WHERE lower(identity_data->>'email') ~ '^e2e\+.*@familiada\.online$') THEN RAISE EXCEPTION 'identity_data_old_domain'; END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) ~ '^e2e\+.*@familiada\.online$') THEN RAISE EXCEPTION 'profile_old_domain'; END IF;
 IF NOT public.is_test_email('e2e+standard01@familijna.app') OR NOT public.is_test_email('e2e+standard01@familiada.online') THEN RAISE EXCEPTION 'is_test_email'; END IF;
 IF public.is_test_email('ktos@familijna.app') THEN RAISE EXCEPTION 'is_test_email_other'; END IF;
 BEGIN
  INSERT INTO public.e2e_emails(recipient) VALUES ('e2e+standard01@familiada.online');
  RAISE EXCEPTION 'old_recipient_accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'e2e-addresses-familijna-507 OK';
END $$;
