-- ============================================================
-- 111: Cron embeddingów — użyj vault secrets (jak mail-worker)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.invoke_embed_missing_market_games(
  p_lang text DEFAULT 'all',
  p_limit integer DEFAULT 25
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_anon text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  v_url  text := v_base || '/functions/v1/generate-game';
begin
  if coalesce(v_base, '') = '' or coalesce(v_anon, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon
    ),
    body := jsonb_build_object(
      'action', 'embed-missing',
      'lang', coalesce(nullif(p_lang, ''), 'all'),
      'limit', greatest(1, least(coalesce(p_limit, 25), 50))
    )
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
    'select public.invoke_embed_missing_market_games(''all'', 25);'
  );
end $$;

