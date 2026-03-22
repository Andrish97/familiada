-- 127: Auto-delete mail_function_logs entries older than 1 month
-- Runs daily at 3:00 AM UTC via pg_cron

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-mail-function-logs',
  '0 3 * * *',
  $$
  DELETE FROM mail_function_logs
  WHERE created_at < NOW() - INTERVAL '1 month';
  $$
);
