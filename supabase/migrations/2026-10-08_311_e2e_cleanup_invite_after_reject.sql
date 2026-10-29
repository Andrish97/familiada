-- Migration 311: e2e — czyszczenie pary kont testowych usuwa też blokadę
-- 30 dni po odrzuceniu subskrypcji (poll:invite_after_reject, migracja 310).
-- Bez tego test „odrzucenie” blokował kolejne testy zaproszeń tej samej pary
-- (brak maila w @mailbox). Tylko funkcja testowa, bez wpływu na użytkowników.
BEGIN;

CREATE OR REPLACE FUNCTION "public"."e2e_poll_subscriptions_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
  WHERE action_key IN ('poll:invite', 'poll:resend', 'poll:share', 'poll:invite_after_reject') -- 311: także blokada 30 dni po odrzuceniu (migracja 310)
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
$_$;

COMMIT;
