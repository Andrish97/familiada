-- ============================================================
-- 110: Fix cron schedule for embed-missing-market-games
-- (109 got marked as applied but failed due to SQL quoting)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

INSERT INTO public.app_config(key, value, note)
VALUES
  ('edge_url', 'https://api.familiada.online', 'Base URL do Supabase Functions (np. https://api.familiada.online)'),
  ('edge_service_role_jwt', '', 'JWT (service_role) do wywołań Edge Functions z pg_cron')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cron_embed_missing_market_games()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_url text;
  v_jwt text;
begin
  select value into v_url from public.app_config where key = 'edge_url';
  select value into v_jwt from public.app_config where key = 'edge_service_role_jwt';

  if coalesce(v_url, '') = '' or coalesce(v_jwt, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/generate-game',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt,
      'apikey', v_jwt
    ),
    body := '{"action":"embed-missing","lang":"all","limit":25}'
  );
end;
$$;

DO $$
declare
  v_jobid int;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'embed-missing-market-games'
   limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'embed-missing-market-games',
    '*/15 * * * *',
    'select public.cron_embed_missing_market_games();'
  );
end $$;

