BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('baseline:recipient','pair',60,true),('contact:confirmation','email',0,false),('admin:compose','email',0,false),('admin:marketing','email',0,false) ON CONFLICT DO NOTHING;
DO $$ DECLARE result jsonb; q public.mail_queue; issued jsonb; message_id uuid; report_id uuid; row_id uuid; BEGIN
 result:=public.mail_queue_delivery_context_prototype(gen_random_uuid());
 IF result->>'reason' IS DISTINCT FROM 'skipped_missing' THEN RAISE EXCEPTION 'missing queue accepted'; END IF;
 result:=public.mail_center_request_link_prototype('delivery360@example.invalid',repeat('d',64),'Fixture','<html lang="pl"><body>MAIL_CENTER_ACCESS_TOKEN</body></html>','pl');
 SELECT * INTO q FROM public.mail_queue WHERE to_email='delivery360@example.invalid';
 IF public.mail_queue_delivery_context_prototype(q.id)->>'reason' IS DISTINCT FROM 'skipped_not_claimed' THEN RAISE EXCEPTION 'unclaimed mail accepted'; END IF;
 UPDATE public.mail_queue SET status='sending' WHERE id=q.id;
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email=q.to_email;
 result:=public.mail_queue_delivery_context_prototype(q.id);
 IF result->>'allowed' IS DISTINCT FROM 'true' OR result->>'verification' IS DISTINCT FROM 'true' OR result?'footer_token' THEN RAISE EXCEPTION 'private confirmation preference exception failed'; END IF;
 UPDATE public.mail_center_links_prototype SET consumed_at=now() WHERE id=q.mail_center_link_id_prototype;
 IF public.mail_queue_delivery_context_prototype(q.id)->>'reason' IS DISTINCT FROM 'skipped_verification_closed' THEN RAISE EXCEPTION 'consumed confirmation still deliverable'; END IF;
 UPDATE public.mail_center_links_prototype SET consumed_at=NULL,expires_at=now()-interval '1 second' WHERE id=q.mail_center_link_id_prototype;
 IF public.mail_queue_delivery_context_prototype(q.id)->>'allowed'='true' THEN RAISE EXCEPTION 'expired confirmation deliverable'; END IF;
 UPDATE public.mail_center_links_prototype SET expires_at=now()+interval '1 hour',revoked_at=now() WHERE id=q.mail_center_link_id_prototype;
 IF public.mail_queue_delivery_context_prototype(q.id)->>'allowed'='true' THEN RAISE EXCEPTION 'revoked confirmation deliverable'; END IF;
 DELETE FROM public.mail_center_links_prototype WHERE id=q.mail_center_link_id_prototype;
 IF public.mail_queue_delivery_context_prototype(q.id)->>'allowed'='true' THEN RAISE EXCEPTION 'deleted proof became ordinary allowed mail'; END IF;

 INSERT INTO public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key,status)
  VALUES('ordinary360@example.invalid','Fixture','<html lang="uk"><body>Original</body></html>','admin:marketing','fixture','sending') RETURNING id INTO row_id;
 result:=public.mail_queue_delivery_context_prototype(row_id);
 IF result->>'allowed' IS DISTINCT FROM 'true' OR result->>'footer_token' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'full delivery footer missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.mail_queue WHERE id=row_id AND html LIKE '%'||(result->>'footer_token')||'%') THEN RAISE EXCEPTION 'full capability leaked into readable queue'; END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=now() WHERE email='ordinary360@example.invalid';
 IF public.mail_queue_delivery_context_prototype(row_id)->>'reason' IS DISTINCT FROM 'skipped_notification_preference' THEN RAISE EXCEPTION 'fresh global preference ignored'; END IF;

 INSERT INTO public.reports(ticket_number) VALUES('FIXTURE-DELIVERY360') RETURNING id INTO report_id;
 INSERT INTO public.messages(source,direction,from_email,report_id) VALUES('form','inbound','delivery360@example.invalid',report_id) RETURNING id INTO message_id;
 IF public.mail_contact_reply_source_prototype(report_id,'delivery360@example.invalid') IS DISTINCT FROM message_id
  OR public.mail_contact_reply_source_prototype(report_id,'foreign360@example.invalid') IS NOT NULL THEN RAISE EXCEPTION 'reply source crossed recipient boundary'; END IF;
 INSERT INTO public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key,status,contact_message_id_prototype)
  VALUES('delivery360@example.invalid','Fixture','Original','contact:confirmation','fixture','sending',message_id) RETURNING id INTO row_id;
 IF public.mail_queue_delivery_context_prototype(row_id)->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'actual requested contact blocked by global-off'; END IF;
 UPDATE public.messages SET deleted_at=now() WHERE id=message_id;
 IF public.mail_contact_reply_source_prototype(report_id,'delivery360@example.invalid') IS NOT NULL THEN RAISE EXCEPTION 'deleted contact accepted as reply source'; END IF;
 IF public.mail_queue_delivery_context_prototype(row_id)->>'reason' IS DISTINCT FROM 'skipped_contact_closed' THEN RAISE EXCEPTION 'deleted contact source still deliverable'; END IF;
 BEGIN
  INSERT INTO public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key) VALUES('delivery360@example.invalid','Spoof','Fake','contact:confirmation','fixture');
  RAISE EXCEPTION 'unbound contact bypassed global preference';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_contact_source' THEN RAISE; END IF; END;
 IF has_function_privilege('authenticated','public.mail_queue_delivery_context_prototype(uuid)','EXECUTE') OR has_function_privilege('anon','public.mail_queue_delivery_context_prototype(uuid)','EXECUTE') THEN RAISE EXCEPTION 'public delivery access'; END IF;
 RAISE NOTICE 'delivery claim, actual proof, global-off, private footer and contact source contract passed';
END $$;
ROLLBACK;
