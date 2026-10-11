-- Dedicated deletion-test recipients11/12; caller remains limited to pool1–8.
BEGIN;
CREATE OR REPLACE FUNCTION public.e2e_poll_mail_budget_cleanup(p_recipient_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); caller text; recipient text:=public._norm_email(p_recipient_email); n integer;
BEGIN
 SELECT public._norm_email(email) INTO caller FROM auth.users WHERE id=uid;
 IF uid IS NULL OR caller IS NULL OR caller !~ '^test[1-8]@familiada[.]online$'
 OR recipient IS NULL OR recipient !~ '^test([1-8]|11|12|14)@familiada[.]online$' THEN
  RETURN jsonb_build_object('ok',false,'err','test_accounts_required'); END IF;
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=uid AND recipient_key=md5(recipient);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',n);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_poll_mail_budget_cleanup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_poll_mail_budget_cleanup(text) TO authenticated;
COMMIT;
