-- Bezpieczeństwo (audyt E24, N4, 2026-10-21): funkcja Edge storage-cleanup
-- (klucz serwisowy, usuwa pliki z kolejki storage_cleanup_queue) przyjmowała
-- żądania bez uwierzytelnienia. Po poprawce wymaga nagłówka
-- X-Internal-Secret = hex(HMAC-SHA256(klucz mail_worker_secret,
-- 'storage-cleanup')). Funkcja liczy to samo z env MAIL_WORKER_SECRET (ta sama
-- wartość co Vault) -- bez nowego sekretu; wartość pochodna nie otwiera
-- mail-worker. Zmiana dodająca: obecna wersja funkcji ignoruje nagłówek.

CREATE OR REPLACE FUNCTION public.storage_cleanup_kick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_base   text;
  v_anon   text;
  v_secret text;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'anon_key';
  select btrim(decrypted_secret) into v_secret from vault.decrypted_secrets where name = 'mail_worker_secret';
  if coalesce(v_base, '') = '' or coalesce(v_anon, '') = '' then
    raise warning 'storage_cleanup_kick: brak project_url/anon_key w vault';
    return;
  end if;
  if coalesce(v_secret, '') = '' then
    raise warning 'storage_cleanup_kick: brak mail_worker_secret w vault';
    return;
  end if;
  perform net.http_post(
    url := v_base || '/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'X-Internal-Secret', encode(extensions.hmac('storage-cleanup', v_secret, 'sha256'), 'hex')
    ),
    body := '{}'::jsonb
  );
exception when others then
  -- brak pg_net / vault nie może zablokować usunięcia; cron ponowi
  raise warning 'storage_cleanup_kick: %', sqlerrm;
end;
$$;
REVOKE ALL ON FUNCTION public.storage_cleanup_kick() FROM PUBLIC, anon, authenticated;
