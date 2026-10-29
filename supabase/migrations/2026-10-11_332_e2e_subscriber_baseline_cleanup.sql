-- E19: izolacja kolejnych scenariuszy rzeczywistych maili na test14.
-- Czyścimy tylko podłogę konkretnej pary test1–8 -> test14.
BEGIN;
CREATE OR REPLACE FUNCTION public.e2e_subscriber_email_cleanup(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_caller text; v_email text:=lower(trim(p_email));
BEGIN
  SELECT lower(email) INTO v_caller FROM auth.users WHERE id=v_uid;
  IF v_caller IS NULL OR v_caller !~ '^test[1-8]@familiada[.]online$'
    OR v_email IS DISTINCT FROM 'test14@familiada.online' THEN
    RETURN jsonb_build_object('ok',false,'err','test accounts required');
  END IF;
  DELETE FROM public.poll_tasks WHERE owner_id=v_uid AND lower(recipient_email)=v_email;
  DELETE FROM public.poll_subscriptions WHERE owner_id=v_uid AND lower(subscriber_email)=v_email;
  DELETE FROM public.mail_cooldowns WHERE action_key LIKE 'poll:%'
    AND target_key LIKE 'pair:'||v_uid::text||':email:'||md5(v_email)||'%';
  DELETE FROM public.mail_cooldowns WHERE action_key='baseline:recipient'
    AND target_key='pair:'||v_uid::text||':'||md5(v_email);
  DELETE FROM public.email_cooldowns WHERE email_hash=md5(v_email);
  RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_subscriber_email_cleanup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_subscriber_email_cleanup(text) TO authenticated;
COMMIT;
