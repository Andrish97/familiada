-- ============================================================
-- 133: Fix — cron guest-cleanup-expired (poprawka 132)
-- ============================================================

DO $outer$
DECLARE
  v_jobid int;
BEGIN
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'guest-cleanup-expired'
   LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'guest-cleanup-expired',
    '0 3 * * *',
    'SELECT public.guest_cleanup_expired(500);'
  );
END $outer$;
