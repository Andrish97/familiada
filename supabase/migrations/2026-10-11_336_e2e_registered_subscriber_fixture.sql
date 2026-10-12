-- Fixture dawnej aktywnej subskrypcji konta; normalny INSERT jest zablokowany.
-- Tylko nadawca test1–7 -> istniejące konto test8; brak maili i zmiany relacji Friends.
BEGIN;
CREATE OR REPLACE FUNCTION public.e2e_registered_subscriber_fixture(p_remove boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); caller text; recipient uuid; sid uuid;
BEGIN
 SELECT lower(email) INTO caller FROM auth.users WHERE id=uid;
 IF caller IS NULL OR caller !~ '^test[1-7]@familiada[.]online$' THEN
   RETURN jsonb_build_object('ok',false,'err','test accounts required'); END IF;
 SELECT id INTO recipient FROM auth.users WHERE lower(email)='test8@familiada.online';
 IF NOT coalesce(p_remove,false) AND (recipient IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.profiles WHERE id=recipient AND NOT is_guest)) THEN
   RETURN jsonb_build_object('ok',false,'err','recipient test account missing'); END IF;
 DELETE FROM public.poll_subscriptions WHERE owner_id=uid
 AND (subscriber_user_id=recipient OR public._norm_email(subscriber_email)='test8@familiada.online');
 IF coalesce(p_remove,false) THEN RETURN jsonb_build_object('ok',true,'removed',true); END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,accepted_at)
 VALUES(uid,'test8@familiada.online','active',now()) RETURNING id INTO sid;
 RETURN jsonb_build_object('ok',true,'id',sid,'recipient_user_id',recipient);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_registered_subscriber_fixture(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_registered_subscriber_fixture(boolean) TO authenticated;
COMMIT;
