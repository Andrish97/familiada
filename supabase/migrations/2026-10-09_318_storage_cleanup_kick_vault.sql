-- 318: storage_cleanup_kick() woła edge function storage-cleanup przez
-- sekrety z vault (project_url, anon_key) — jak invoke_mail_worker /
-- invoke_embed_missing_market_games. Klucze app_config (edge_url,
-- edge_service_role_jwt) nie są ustawione na produkcji, więc od 313 kolejka
-- rosła bez opróżniania (e2e 2026-10-09: ręczne wywołanie usunęło >1000 wpisów).
-- Funkcja sama używa klucza service_role ze swojego środowiska; wołający
-- potrzebuje tylko ważnego JWT dla bramki.
BEGIN;

CREATE OR REPLACE FUNCTION public.storage_cleanup_kick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_base text;
  v_anon text;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'anon_key';
  if coalesce(v_base, '') = '' or coalesce(v_anon, '') = '' then
    raise warning 'storage_cleanup_kick: brak project_url/anon_key w vault';
    return;
  end if;
  perform net.http_post(
    url := v_base || '/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon
    ),
    body := '{}'::jsonb
  );
exception when others then
  -- brak pg_net / vault nie może zablokować usunięcia; cron ponowi
  raise warning 'storage_cleanup_kick: %', sqlerrm;
end;
$$;
REVOKE ALL ON FUNCTION public.storage_cleanup_kick() FROM PUBLIC, anon, authenticated;

COMMIT;
