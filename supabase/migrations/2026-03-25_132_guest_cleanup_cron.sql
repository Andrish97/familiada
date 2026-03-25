-- ============================================================
-- 132: Cron — automatyczne usuwanie wygasłych kont gości
-- ============================================================

DO $$
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
    '0 3 * * *',   -- codziennie o 3:00 UTC
    $$ SELECT public.guest_cleanup_expired(500); $$
  );
END $$;
