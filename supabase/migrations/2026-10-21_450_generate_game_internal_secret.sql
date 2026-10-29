-- Bezpieczeństwo (audyt E24, K2, 2026-10-21): funkcja Edge generate-game
-- działa kluczem serwisowym (publikacja/zmiana/usuwanie gier producenta,
-- generowanie AI) i przyjmowała żądania bez uwierzytelnienia. Po poprawce
-- wymaga nagłówka X-Internal-Secret równego GENERATE_GAME_SECRET (env
-- funkcji). Cron w bazie wysyła ten nagłówek z Vault (sekret
-- `generate_game_secret`, ta sama wartość). Zmiana dodająca: obecna wersja
-- funkcji ignoruje nagłówek, więc migracja jest zgodna wstecz.

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
  v_base   text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_anon   text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'generate_game_secret');
  v_url    text := v_base || '/functions/v1/generate-game';
begin
  if coalesce(v_base, '') = '' or coalesce(v_anon, '') = '' then
    return;
  end if;
  if coalesce(v_secret, '') = '' then
    raise warning 'invoke_embed_missing_market_games: brak generate_game_secret w vault';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'X-Internal-Secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'embed-missing',
      'lang', coalesce(nullif(p_lang, ''), 'all'),
      'limit', greatest(1, least(coalesce(p_limit, 25), 50))
    )
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.cron_embed_missing_market_games()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_url    text;
  v_jwt    text;
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'generate_game_secret');
begin
  select value into v_url from public.app_config where key = 'edge_url';
  select value into v_jwt from public.app_config where key = 'edge_service_role_jwt';

  if coalesce(v_url, '') = '' or coalesce(v_jwt, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/generate-game',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt,
      'apikey', v_jwt,
      'X-Internal-Secret', v_secret
    ),
    body := '{"action":"embed-missing","lang":"all","limit":25}'::jsonb
  );
end;
$$;

-- Obie tylko dla crona / klucza serwisowego.
REVOKE EXECUTE ON FUNCTION public.invoke_embed_missing_market_games(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_embed_missing_market_games() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_embed_missing_market_games(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_embed_missing_market_games() TO service_role;
