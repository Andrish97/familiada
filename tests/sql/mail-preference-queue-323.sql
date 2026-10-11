-- Produkcyjny smoke test migracji 323. Całość jest w transakcji i kończy
-- ROLLBACK, więc nie pozostawia wierszy user_flags ani mail_queue.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_sender uuid;
  v_muted uuid;
  v_enabled uuid;
  v_muted_email text;
  v_enabled_email text;
  v_rows integer;
BEGIN
  SELECT id INTO v_sender FROM auth.users WHERE lower(email)='test1@familiada.online';
  SELECT id,email INTO v_muted,v_muted_email FROM auth.users WHERE lower(email)='test2@familiada.online';
  SELECT id,email INTO v_enabled,v_enabled_email FROM auth.users WHERE lower(email)='test3@familiada.online';
  IF v_sender IS NULL OR v_muted IS NULL OR v_enabled IS NULL THEN
    RAISE EXCEPTION 'missing E2E fixture account for migration 323 smoke test';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email)='test14@familiada.online') THEN
    RAISE EXCEPTION 'test14 must remain a mailbox without an account';
  END IF;

  INSERT INTO public.user_flags(user_id,email_notifications) VALUES (v_muted,false)
    ON CONFLICT (user_id) DO UPDATE SET email_notifications=false;
  INSERT INTO public.user_flags(user_id,email_notifications) VALUES (v_enabled,true)
    ON CONFLICT (user_id) DO UPDATE SET email_notifications=true;

  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
    VALUES(v_sender,v_muted_email,'E19-323-muted-'||gen_random_uuid(),'','legacy:unclassified','e19-323-muted');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'disabled account was inserted into mail_queue'; END IF;

  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
    VALUES(v_sender,v_enabled_email,'E19-323-enabled-'||gen_random_uuid(),'','legacy:unclassified','e19-323-enabled');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'enabled account was not inserted into mail_queue'; END IF;

  INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key)
    VALUES(v_sender,'test14@familiada.online','E19-323-no-account-'||gen_random_uuid(),'','legacy:unclassified','e19-323-no-account');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'mailbox without an account was not inserted into mail_queue'; END IF;
END $$;
ROLLBACK;
