-- ============================================================
-- 112: Remove obsolete pg_cron job: process-game-queue
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
declare
  v_jobid int;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'process-game-queue'
   limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

