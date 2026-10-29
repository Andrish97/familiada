-- Tylko izolowana baza po local-stubs + schema.sql + migracje 288-323.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END; $$;

INSERT INTO auth.users(id,email) VALUES
  ('aaaaaaaa-3230-0000-0000-000000000001','sender323@example.com'),
  ('bbbbbbbb-3230-0000-0000-000000000002','muted323@example.com'),
  ('cccccccc-3230-0000-0000-000000000003','enabled323@example.com');
INSERT INTO public.user_flags(user_id,email_notifications) VALUES
  ('bbbbbbbb-3230-0000-0000-000000000002',false),
  ('cccccccc-3230-0000-0000-000000000003',true);

-- Izolujemy tę bramkę od niezależnej konfiguracji polityk cooldownów.
ALTER TABLE public.mail_queue DISABLE TRIGGER trg_mail_queue_cooldown_guard;
INSERT INTO public.mail_queue(created_by,to_email,subject,html,cooldown_action_key,cooldown_target_key) VALUES
  ('aaaaaaaa-3230-0000-0000-000000000001','muted323@example.com','Muted','body','baseline:recipient','test:muted'),
  ('aaaaaaaa-3230-0000-0000-000000000001','enabled323@example.com','Enabled','body','baseline:recipient','test:enabled'),
  ('aaaaaaaa-3230-0000-0000-000000000001','noaccount323@example.com','No account','body','baseline:recipient','test:noaccount');
ALTER TABLE public.mail_queue ENABLE TRIGGER trg_mail_queue_cooldown_guard;

SELECT pg_temp.check_result(
  NOT EXISTS(SELECT 1 FROM public.mail_queue WHERE to_email='muted323@example.com'),
  'email_notifications=false suppresses the queue insert');
SELECT pg_temp.check_result(
  EXISTS(SELECT 1 FROM public.mail_queue WHERE to_email='enabled323@example.com'),
  'enabled account remains queueable');
SELECT pg_temp.check_result(
  EXISTS(SELECT 1 FROM public.mail_queue WHERE to_email='noaccount323@example.com'),
  'recipient without account remains queueable');
ROLLBACK;
