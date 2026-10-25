-- Porównywanie znaczenia może pracować partią przez kilkadziesiąt sekund.
-- Domyślny krótki timeout pg_net nie wystarcza na uzupełnienie indeksu.
BEGIN;
CREATE OR REPLACE FUNCTION public.invoke_embed_missing_market_games(
  p_lang text DEFAULT 'all', p_limit integer DEFAULT 25
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_base text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='project_url');
  v_anon text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='anon_key');
  v_secret text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='generate_game_secret');
BEGIN
  IF coalesce(v_base,'')='' OR coalesce(v_anon,'')='' THEN RETURN; END IF;
  IF coalesce(v_secret,'')='' THEN
    RAISE WARNING 'invoke_embed_missing_market_games: brak generate_game_secret w vault';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_base || '/functions/v1/generate-game',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || v_anon,'apikey',v_anon,'X-Internal-Secret',v_secret),
    body := jsonb_build_object('action','embed-missing',
      'lang',coalesce(nullif(p_lang,''),'all'),
      'limit',greatest(1,least(coalesce(p_limit,25),50))),
    timeout_milliseconds := 90000
  );
END;
$$;
COMMIT;
