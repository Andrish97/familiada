\set ON_ERROR_STOP 1
-- 506: wewnętrzne nazwy familijna — zadania pg_cron, mail_cron_set, metadane zmiany e-maila.
-- Lokalnie pg_cron nie działa: atrapa tabeli cron.job (na produkcji ta sama zmiana nazwy).
BEGIN;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text, active boolean DEFAULT true);
INSERT INTO cron.job (jobname, schedule, command) VALUES
  ('familiada_mail_worker', '* * * * *', 'select public.invoke_mail_worker(25);'),
  ('familiada_market_cleanup', '0 3 * * *', 'select public.market_cleanup_rejected()');
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000000000506', 'zmiana506@example.invalid',
   '{"username":"u506","familiada_email_change_pending":"nowy506@example.invalid","familiada_email_change_intent":"guest_migrate"}'),
  ('00000000-0000-4000-8000-000000000507', 'bez506@example.invalid', '{"username":"u507"}');
\i supabase/migrations/2026-10-29_506_internal_names_familijna.sql
DO $$
DECLARE m jsonb; st record;
BEGIN
 IF (SELECT count(*) FROM cron.job WHERE jobname LIKE 'familiada%') <> 0 THEN RAISE EXCEPTION 'stare zadania'; END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familijna_mail_worker' AND schedule = '* * * * *' AND command = 'select public.invoke_mail_worker(25);') THEN RAISE EXCEPTION 'mail_worker'; END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familijna_market_cleanup' AND schedule = '0 3 * * *') THEN RAISE EXCEPTION 'market_cleanup'; END IF;
 SELECT raw_user_meta_data INTO m FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000506';
 IF m ? 'familiada_email_change_pending' OR m ? 'familiada_email_change_intent' THEN RAISE EXCEPTION 'stare klucze %', m; END IF;
 IF m->>'familijna_email_change_pending' <> 'nowy506@example.invalid' OR m->>'familijna_email_change_intent' <> 'guest_migrate' OR m->>'username' <> 'u506' THEN RAISE EXCEPTION 'nowe klucze %', m; END IF;
 SELECT raw_user_meta_data INTO m FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000507';
 IF m <> '{"username":"u507"}'::jsonb THEN RAISE EXCEPTION 'bez zmian %', m; END IF;
 IF pg_get_functiondef('public.mail_cron_set(text,boolean,integer,text)'::regprocedure) LIKE '%familiada%' THEN RAISE EXCEPTION 'mail_cron_set'; END IF;
 IF pg_get_functiondef('public.email_get_status(text)'::regprocedure) NOT LIKE '%familijna_email_change_intent%' THEN RAISE EXCEPTION 'email_get_status'; END IF;
 RAISE NOTICE 'internal-names-506 OK';
END $$;
ROLLBACK;
