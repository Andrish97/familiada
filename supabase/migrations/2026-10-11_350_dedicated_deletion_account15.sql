-- Account15 is dedicated to deletion;14 remains mailbox-only.
BEGIN;
ALTER TABLE public.e2e_emails DROP CONSTRAINT e2e_emails_recipient_check;
ALTER TABLE public.e2e_emails ADD CONSTRAINT e2e_emails_recipient_check
 CHECK (recipient ~ '^test([1-9]|1[0-5])@familiada\.online$');
CREATE OR REPLACE FUNCTION "public"."e2e_friendships_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
     OR v_other_email !~ '^test([1-9]|1[0-3]|15)@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.friendships
  WHERE (requester_id = v_uid AND addressee_id = p_other_user_id)
     OR (requester_id = p_other_user_id AND addressee_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.mail_cooldowns
  WHERE action_key LIKE 'friend:%'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$_$;
CREATE OR REPLACE FUNCTION public.e2e_poll_mail_budget_cleanup(p_recipient_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); caller text; recipient text:=public._norm_email(p_recipient_email); n integer;
BEGIN
 SELECT public._norm_email(email) INTO caller FROM auth.users WHERE id=uid;
 IF uid IS NULL OR caller IS NULL OR caller !~ '^test[1-8]@familiada[.]online$'
 OR recipient IS NULL OR recipient !~ '^test([1-8]|11|12|14|15)@familiada[.]online$' THEN
  RETURN jsonb_build_object('ok',false,'err','test_accounts_required'); END IF;
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=uid AND recipient_key=md5(recipient);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',n);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_poll_mail_budget_cleanup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_poll_mail_budget_cleanup(text) TO authenticated;
COMMIT;
