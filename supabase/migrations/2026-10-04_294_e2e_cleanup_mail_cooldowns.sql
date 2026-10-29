-- Ujednolicenie cooldownów maili (warstwa 1, część 6/7).
--
-- Retry testów e2e (poll_subscriptions/shared_devices) nie może dziedziczyć
-- cooldownów z nowej, wspólnej tabeli mail_cooldowns -- analogicznie do
-- migracji 285, która już czyści email_cooldowns z tego samego powodu.
-- CREATE OR REPLACE, nie edycja 279/285/287 (migracje tylko do przodu).
CREATE OR REPLACE FUNCTION public.e2e_poll_subscriptions_cleanup(p_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_subscriptions_deleted integer := 0;
  v_tasks_deleted integer := 0;
  v_cooldowns_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.poll_tasks
  WHERE (owner_id = v_uid AND recipient_user_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_user_id = v_uid);
  GET DIAGNOSTICS v_tasks_deleted = ROW_COUNT;

  DELETE FROM public.poll_subscriptions
  WHERE (owner_id = v_uid AND subscriber_user_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND subscriber_user_id = v_uid);
  GET DIAGNOSTICS v_subscriptions_deleted = ROW_COUNT;

  DELETE FROM public.email_cooldowns
  WHERE email_hash IN (md5(v_caller_email), md5(v_other_email));
  GET DIAGNOSTICS v_cooldowns_deleted = ROW_COUNT;

  DELETE FROM public.mail_cooldowns
  WHERE action_key IN ('poll:invite', 'poll:resend', 'poll:share')
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'subscriptions_deleted', v_subscriptions_deleted,
    'tasks_deleted', v_tasks_deleted,
    'cooldowns_deleted', v_cooldowns_deleted,
    'mail_cooldowns_deleted', v_mail_cooldowns_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_poll_subscriptions_cleanup(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.e2e_poll_subscriptions_cleanup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.e2e_shared_devices_cleanup(p_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.shared_devices
  WHERE (owner_id = v_uid AND recipient_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- device:share cooldown target_key niesie też device_type/game_id, stąd
  -- LIKE z prefiksem pary, nie dokładna wartość.
  DELETE FROM public.mail_cooldowns
  WHERE action_key = 'device:share'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_shared_devices_cleanup(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.e2e_shared_devices_cleanup(uuid) TO authenticated;
