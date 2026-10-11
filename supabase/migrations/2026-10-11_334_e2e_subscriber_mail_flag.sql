-- Wyłącznie skrzynka test14 bez konta: przywrócenie flagi po E2E globalnego wypisania.
-- Normalne adresy i trwałość ich rezygnacji nie są zmieniane.
BEGIN;
CREATE OR REPLACE FUNCTION public.e2e_subscriber_mail_flag(p_reset boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE caller text; stamp timestamptz;
BEGIN
 SELECT lower(email) INTO caller FROM auth.users WHERE id=auth.uid();
 IF caller IS NULL OR caller !~ '^test[1-8]@familiada[.]online$' THEN
   RETURN jsonb_build_object('ok',false,'err','test accounts required');
 END IF;
 SELECT suppressed_at INTO stamp FROM public.email_unsub_tokens
 WHERE public._norm_email(email)='test14@familiada.online';
 IF coalesce(p_reset,false) THEN
   UPDATE public.email_unsub_tokens SET suppressed_at=NULL
   WHERE public._norm_email(email)='test14@familiada.online';
 END IF;
 RETURN jsonb_build_object('ok',true,'previous_suppressed_at',stamp,
   'suppressed_at',CASE WHEN coalesce(p_reset,false) THEN NULL ELSE stamp END);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_subscriber_mail_flag(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_subscriber_mail_flag(boolean) TO authenticated;
COMMIT;
