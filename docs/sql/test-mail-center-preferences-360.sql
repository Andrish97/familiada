BEGIN;
DO $$ DECLARE account uuid:='aaaaaaaa-3605-0000-0000-000000000001'; root uuid; old jsonb; result jsonb; BEGIN
 root:=public._ensure_unsub_token('prefs360@example.invalid');
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE token=root;
 old:=public.mail_center_issue_link_prototype('prefs360@example.invalid','footer');
 INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data)
  VALUES(account,'prefs360@example.invalid',false,now(),'{"username":"prefs360"}');
 IF NOT EXISTS(SELECT 1 FROM public.email_unsub_tokens WHERE token=root AND suppressed_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.user_flags WHERE user_id=account AND NOT email_notifications) THEN RAISE EXCEPTION 'registration enabled mail or removed suppression root'; END IF;
 PERFORM set_config('request.jwt.claim.sub',account::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',account,'role','authenticated')::text,true);
 IF public.get_my_email_notifications_prototype(account) THEN RAISE EXCEPTION 'effective account getter ignored global suppression'; END IF;
 UPDATE public.profiles SET email='foreignprefs360@example.invalid' WHERE id=account;
 PERFORM public._ensure_unsub_token('foreignprefs360@example.invalid');
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email='foreignprefs360@example.invalid';
 IF NOT public.set_my_email_notifications_prototype(account,true) OR NOT public.get_my_email_notifications_prototype(account) THEN RAISE EXCEPTION 'explicit restoration failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.email_unsub_tokens WHERE email='foreignprefs360@example.invalid' AND suppressed_at IS NOT NULL) THEN RAISE EXCEPTION 'profile alias restored foreign mailbox'; END IF;
 IF public.mail_center_exchange_link_prototype(old->>'token')->>'ok'='true' THEN RAISE EXCEPTION 'account toggle resurrected anonymous capability'; END IF;
 IF public.set_my_email_notifications_prototype(account,false) OR public.get_my_email_notifications_prototype(account) THEN RAISE EXCEPTION 'disable failed'; END IF;
 -- The global root is effective even if an older client changes only user_flags.
 UPDATE public.user_flags SET email_notifications=true WHERE user_id=account;
 IF public.get_my_email_notifications_prototype(account) THEN RAISE EXCEPTION 'old flag-only client bypassed global root'; END IF;
 IF NOT public.set_my_email_notifications_prototype(account,true) THEN RAISE EXCEPTION 'explicit restore after old client failed'; END IF;
 result:=public.poll_go_global_unsubscribe(root);
 IF result IS DISTINCT FROM '{"ok":true}'::jsonb OR public.get_my_email_notifications_prototype(account) THEN RAISE EXCEPTION 'legacy global footer did not update effective account preference'; END IF;
 BEGIN
  PERFORM public.set_my_email_notifications_prototype(gen_random_uuid(),true); RAISE EXCEPTION 'foreign preference accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'forbidden' THEN RAISE; END IF; END;
 UPDATE auth.users SET email_confirmed_at=NULL WHERE id=account;
 BEGIN
  PERFORM public.set_my_email_notifications_prototype(account,true); RAISE EXCEPTION 'unconfirmed email restored';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'email_not_confirmed' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','public.set_my_email_notifications_prototype(uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'anonymous can alter account preference'; END IF;
 RAISE NOTICE 'canonical account preference, explicit restore, retained registration root, legacy footer and ACL passed';
END $$;
ROLLBACK;
