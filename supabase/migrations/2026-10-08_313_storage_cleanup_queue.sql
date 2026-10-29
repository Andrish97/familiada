-- 313: pliki w Storage usuwa baza, nie przeglądarka (docs/usuwanie-danych.md,
-- „Pliki w Storage”).
--
-- SQL nie usuwa obiektów Storage (tylko Storage API), więc usunięcie wiersza
-- zapisuje w TEJ SAMEJ transakcji wpis w kolejce storage_cleanup_queue
-- (trigger) — wycofana transakcja nie zostawia wpisu, zatwierdzona zawsze go
-- ma. Kolejkę opróżnia edge function storage-cleanup: wołana przez pg_net po
-- zatwierdzeniu (pg_net wysyła dopiero po COMMIT) oraz co 10 min przez
-- pg_cron (ponowienia po błędach). Działa przy każdym sposobie usunięcia:
-- gra (delete_resource_checked, market_remove), logo, konto, gość
-- (porzucenie i wygaśnięcie), przywrócenie demo.
--
-- Przed usunięciem pliku storage_cleanup_claim() sprawdza, czy nikt go już nie
-- używa (wiersz odtworzony w tej samej transakcji, np. przywrócenie demo z tym
-- samym obrazem) — wtedy wpis znika bez kasowania pliku.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
  id          bigserial PRIMARY KEY,
  bucket      text NOT NULL CHECK (bucket IN ('user-sounds', 'user-logos')),
  path        text NOT NULL CHECK (path <> '' AND path NOT LIKE '/%'),
  is_folder   boolean NOT NULL,
  -- czego dotyczy (do sprawdzenia przed usunięciem): game / logo / user
  owner_kind  text NOT NULL CHECK (owner_kind IN ('game', 'logo', 'user')),
  owner_id    uuid NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz
);
ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_cleanup_queue FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.storage_cleanup_queue_id_seq FROM anon, authenticated;

-- Wywołanie edge function (po COMMIT, bo pg_net kolejkuje żądania transakcyjnie).
CREATE OR REPLACE FUNCTION public.storage_cleanup_kick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_url text;
  v_jwt text;
begin
  select value into v_url from public.app_config where key = 'edge_url';
  select value into v_jwt from public.app_config where key = 'edge_service_role_jwt';
  if coalesce(v_url, '') = '' or coalesce(v_jwt, '') = '' then return; end if;
  perform net.http_post(
    url := v_url || '/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt,
      'apikey', v_jwt
    ),
    body := '{}'::jsonb
  );
exception when others then
  -- brak pg_net / konfiguracji nie może zablokować usunięcia; cron ponowi
  raise warning 'storage_cleanup_kick: %', sqlerrm;
end;
$$;
REVOKE ALL ON FUNCTION public.storage_cleanup_kick() FROM PUBLIC, anon, authenticated;

-- Ścieżka obrazu logo w buckecie user-logos z publicznego URL (jak
-- storagePathFromUrl w web/logo/js/image.js) — tylko we własnym folderze.
CREATE OR REPLACE FUNCTION public._logo_image_path(p_payload jsonb, p_user uuid) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  select case when p like (p_user::text || '/%') then p end
  from (
    select split_part(split_part(coalesce(p_payload #>> '{source,imageUrl}', ''), '/user-logos/', 2), '?', 1) as p
  ) x
$$;

-- Triggery: wpis w kolejce w transakcji usunięcia (wiersz) + jedno
-- wywołanie edge function na instrukcję.
CREATE OR REPLACE FUNCTION public._storage_cleanup_on_game_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
  values ('user-sounds', old.owner_id::text || '/' || old.id::text, true, 'game', old.id);
  return old;
end;
$$;

CREATE OR REPLACE FUNCTION public._storage_cleanup_on_logo_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_path text := public._logo_image_path(old.payload, old.user_id);
begin
  if v_path is not null then
    insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
    values ('user-logos', v_path, false, 'logo', old.id);
  end if;
  return old;
end;
$$;

CREATE OR REPLACE FUNCTION public._storage_cleanup_on_profile_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  -- cały folder użytkownika w obu bucketach (także stare ścieżki sprzed 214)
  insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
  values ('user-sounds', old.id::text, true, 'user', old.id),
         ('user-logos',  old.id::text, true, 'user', old.id);
  return old;
end;
$$;

CREATE OR REPLACE FUNCTION public._storage_cleanup_kick_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  perform public.storage_cleanup_kick();
  return null;
end;
$$;

DROP TRIGGER IF EXISTS storage_cleanup_row ON public.games;
CREATE TRIGGER storage_cleanup_row AFTER DELETE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public._storage_cleanup_on_game_delete();
DROP TRIGGER IF EXISTS storage_cleanup_kick ON public.games;
CREATE TRIGGER storage_cleanup_kick AFTER DELETE ON public.games
  FOR EACH STATEMENT EXECUTE FUNCTION public._storage_cleanup_kick_trigger();

DROP TRIGGER IF EXISTS storage_cleanup_row ON public.user_logos;
CREATE TRIGGER storage_cleanup_row AFTER DELETE ON public.user_logos
  FOR EACH ROW EXECUTE FUNCTION public._storage_cleanup_on_logo_delete();
DROP TRIGGER IF EXISTS storage_cleanup_kick ON public.user_logos;
CREATE TRIGGER storage_cleanup_kick AFTER DELETE ON public.user_logos
  FOR EACH STATEMENT EXECUTE FUNCTION public._storage_cleanup_kick_trigger();

DROP TRIGGER IF EXISTS storage_cleanup_row ON public.profiles;
CREATE TRIGGER storage_cleanup_row AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._storage_cleanup_on_profile_delete();
DROP TRIGGER IF EXISTS storage_cleanup_kick ON public.profiles;
CREATE TRIGGER storage_cleanup_kick AFTER DELETE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION public._storage_cleanup_kick_trigger();

-- Pobranie paczki do usunięcia (dla edge function, service_role). Wpisy, których
-- właściciel znów istnieje albo których plik jest nadal używany, znikają bez
-- kasowania. Wpis wzięty < 5 min temu nie jest brany drugi raz (równoległe
-- wywołania). Po 20 nieudanych próbach wpis zostaje do ręcznego wglądu.
CREATE OR REPLACE FUNCTION public.storage_cleanup_claim(p_limit integer DEFAULT 100)
RETURNS TABLE(id bigint, bucket text, path text, is_folder boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  delete from public.storage_cleanup_queue q
  where (q.owner_kind = 'game' and exists (select 1 from public.games g where g.id = q.owner_id))
     or (q.owner_kind = 'user' and exists (select 1 from public.profiles p where p.id = q.owner_id))
     or (q.owner_kind = 'logo' and exists (
           select 1 from public.user_logos l
           where l.id = q.owner_id
              or public._logo_image_path(l.payload, l.user_id) = q.path));

  return query
  update public.storage_cleanup_queue q
     set claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select q2.id from public.storage_cleanup_queue q2
     where q2.attempts < 20
       and (q2.claimed_at is null or q2.claimed_at < now() - interval '5 minutes')
     order by q2.id
     limit greatest(1, least(coalesce(p_limit, 100), 500))
     for update skip locked)
  returning q.id, q.bucket, q.path, q.is_folder;
end;
$$;

-- Wynik: udane wpisy znikają, nieudane dostają błąd i wracają po 5 min.
CREATE OR REPLACE FUNCTION public.storage_cleanup_done(p_done bigint[], p_failed jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  delete from public.storage_cleanup_queue where id = any(coalesce(p_done, '{}'));
  update public.storage_cleanup_queue q
     set last_error = f.err
    from (select (e->>'id')::bigint as id, e->>'error' as err from jsonb_array_elements(coalesce(p_failed, '[]'::jsonb)) e) f
   where q.id = f.id;
end;
$$;

REVOKE ALL ON FUNCTION public.storage_cleanup_claim(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storage_cleanup_done(bigint[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_cleanup_claim(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.storage_cleanup_done(bigint[], jsonb) TO service_role;
REVOKE ALL ON FUNCTION public._logo_image_path(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- Ponowienia: co 10 min, tylko gdy kolejka nie jest pusta.
CREATE OR REPLACE FUNCTION public.storage_cleanup_cron() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if exists (select 1 from public.storage_cleanup_queue where attempts < 20) then
    perform public.storage_cleanup_kick();
  end if;
end;
$$;
REVOKE ALL ON FUNCTION public.storage_cleanup_cron() FROM PUBLIC, anon, authenticated;

DO $$
declare
  v_jobid int;
begin
  select jobid into v_jobid from cron.job where jobname = 'storage-cleanup' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule('storage-cleanup', '*/10 * * * *', 'select public.storage_cleanup_cron();');
end $$;

COMMIT;
