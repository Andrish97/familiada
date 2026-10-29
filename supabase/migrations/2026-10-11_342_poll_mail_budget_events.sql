-- Limit 3/24h nie zależy od usuwanej po dostarczeniu kolejki.
BEGIN;
CREATE TABLE IF NOT EXISTS public.poll_mail_budget_events (
 queue_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poll_mail_budget_pair_time ON public.poll_mail_budget_events(owner_id,recipient_key,created_at DESC);
ALTER TABLE public.poll_mail_budget_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_mail_budget_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.poll_mail_budget_events FROM PUBLIC,anon,authenticated;
-- Istniejące maile oczekujące także wykorzystują budżet; bez treści/e-maila.
INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key,created_at)
 SELECT id,created_by,md5(public._norm_email(to_email)),created_at FROM public.mail_queue
 WHERE cooldown_action_key='poll:share' AND created_by IS NOT NULL
  AND public._norm_email(to_email) IS NOT NULL AND created_at>now()-interval '24 hours'
 ON CONFLICT(queue_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public._poll_daily_cap_until(p_owner uuid,p_email text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT created_at+interval '24 hours' FROM public.poll_mail_budget_events
 WHERE owner_id=p_owner AND recipient_key=md5(public._norm_email(p_email)) AND created_at>now()-interval '24 hours'
 ORDER BY created_at DESC OFFSET 2 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._poll_daily_cap_until(uuid,text) FROM PUBLIC,anon,authenticated;
-- Flaga adresu bez konta również poprzedza rezerwację/kolejkę.
CREATE OR REPLACE FUNCTION public.poll_mail_preference_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.cooldown_action_key='poll:share' AND NOT public._contact_mail_enabled(NEW.to_email) THEN RETURN NULL; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_mail_queue_001_poll_preference ON public.mail_queue;
CREATE TRIGGER trg_mail_queue_001_poll_preference BEFORE INSERT ON public.mail_queue
 FOR EACH ROW EXECUTE FUNCTION public.poll_mail_preference_guard();
CREATE OR REPLACE FUNCTION public.poll_mail_budget_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE deadline timestamptz; recipient text;
BEGIN
 IF NEW.cooldown_action_key<>'poll:share' OR NEW.created_by IS NULL THEN RETURN NEW; END IF;
 recipient:=public._norm_email(NEW.to_email);
 IF recipient IS NULL THEN RAISE EXCEPTION 'invalid poll recipient'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('poll-mail-budget:'||NEW.created_by||':'||recipient,342));
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=NEW.created_by AND recipient_key=md5(recipient)
  AND created_at<=now()-interval '24 hours';
 deadline:=public._poll_daily_cap_until(NEW.created_by,recipient);
 IF deadline IS NOT NULL THEN RAISE EXCEPTION 'cooldown_active: poll daily_cap until %',deadline; END IF;
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key,created_at)
 VALUES(NEW.id,NEW.created_by,md5(recipient),now());
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_mail_queue_poll_budget ON public.mail_queue;
CREATE TRIGGER trg_mail_queue_poll_budget AFTER INSERT ON public.mail_queue
 FOR EACH ROW EXECUTE FUNCTION public.poll_mail_budget_guard();
REVOKE ALL ON FUNCTION public.poll_mail_preference_guard(),public.poll_mail_budget_guard() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.poll_mail_budget_expire_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 DELETE FROM public.poll_mail_budget_events WHERE created_at<=now()-interval '24 hours';
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.poll_mail_budget_expire_due() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.poll_mail_budget_expire_due() TO service_role;
DO $$ DECLARE job bigint;
BEGIN
 IF to_regclass('cron.job') IS NOT NULL THEN
  EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=''poll-mail-budget-expiry'' LIMIT 1' INTO job;
  IF job IS NOT NULL THEN PERFORM cron.unschedule(job); END IF;
  PERFORM cron.schedule('poll-mail-budget-expiry','17 * * * *','SELECT public.poll_mail_budget_expire_due()');
 END IF;
END; $$;
-- Testy mogą czyścić wyłącznie własną parę zatwierdzonej puli.
CREATE OR REPLACE FUNCTION public.e2e_poll_mail_budget_cleanup(p_recipient_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); caller text; recipient text:=public._norm_email(p_recipient_email); n integer;
BEGIN
 SELECT public._norm_email(email) INTO caller FROM auth.users WHERE id=uid;
 IF uid IS NULL OR caller IS NULL OR caller !~ '^test[1-8]@familiada[.]online$'
 OR recipient IS NULL OR recipient !~ '^test([1-8]|14)@familiada[.]online$' THEN
  RETURN jsonb_build_object('ok',false,'err','test_accounts_required'); END IF;
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=uid AND recipient_key=md5(recipient);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',n);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_poll_mail_budget_cleanup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_poll_mail_budget_cleanup(text) TO authenticated;
COMMIT;
