-- 100: Setup cron job for game generation queue
-- This ensures the queue is processed even if the UI is closed.
-- Uses pg_net to call the Edge Function every minute.

-- 1. Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create the cron job
-- We call the function without a jobId, it will pick the oldest pending job
SELECT cron.schedule(
  'process-game-queue',
  '* * * * *', -- every minute
  $$
  SELECT net.http_post(
    url := (SELECT value FROM (SELECT (Deno.env.get('SUPABASE_URL')) as value) x) || '/functions/v1/generate-game',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM (SELECT (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) as value) x)
    ),
    body := '{"action": "process-step"}'
  );
  $$
);

-- Note: The above SQL for env variables is a placeholder logic. 
-- In a real Supabase environment, you usually hardcode the URL or use a vault.
-- Since I don't have access to your vault keys directly in SQL, I will provide 
-- a more robust version that you can run in Supabase Studio.
