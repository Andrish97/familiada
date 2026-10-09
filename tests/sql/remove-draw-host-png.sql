\set ON_ERROR_STOP on

CREATE SCHEMA storage;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END
$$;
CREATE TABLE storage.objects(bucket_id text NOT NULL, name text NOT NULL);
CREATE TABLE public.user_logos(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE public.demo_template_data(slot text PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE public.storage_cleanup_queue(
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  path text NOT NULL,
  is_folder boolean NOT NULL,
  owner_kind text NOT NULL,
  owner_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
CREATE TABLE public.games(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY);
CREATE FUNCTION public._logo_url_path(text, uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION public._logo_host_raster_path(jsonb, uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION public.storage_cleanup_kick() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.storage_cleanup_claim(integer DEFAULT 100)
RETURNS TABLE(id bigint, bucket text, path text, is_folder boolean)
LANGUAGE sql AS $$ SELECT NULL::bigint, NULL::text, NULL::text, NULL::boolean WHERE false $$;

INSERT INTO public.user_logos VALUES
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 '{"source":{"mode":"DRAW","hostRasterUrl":"https://x/user-logos/u/old-draw-host.png","hostRasterData":"data:image/png;base64,AA==","imageUrl":"https://x/user-logos/u/keep-image.png","fabricData":{"objects":[{"type":"rect"}]}}}'),
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
 '{"source":{"mode":"IMAGE","imageUrl":"https://x/user-logos/u/keep-image.png"}}');
INSERT INTO public.demo_template_data VALUES ('logo_draw',
 '{"payload":{"source":{"mode":"DRAW","hostRasterUrl":"https://x/logo/assets/demo-draw-host.png","fabricData":{"objects":[{"type":"circle"}]}}}}');
INSERT INTO storage.objects VALUES
('user-logos','u/old-draw-host.png'),('user-logos','u/keep-image.png'),('user-logos','u/another-draw-host.png');

\ir ../../supabase/migrations/2026-10-09_319_remove_draw_host_png.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_logos WHERE payload #> '{source,hostRasterUrl}' IS NOT NULL OR payload #> '{source,hostRasterData}' IS NOT NULL) THEN
    RAISE EXCEPTION 'User logo still references DRAW raster';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_logos WHERE payload #>> '{source,imageUrl}' LIKE '%keep-image.png') THEN
    RAISE EXCEPTION 'IMAGE URL was changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_logos WHERE payload #> '{source,fabricData,objects}' IS NOT NULL) THEN
    RAISE EXCEPTION 'Saved Fabric scene was removed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.demo_template_data
             WHERE payload #> '{payload,source,hostRasterUrl}' IS NOT NULL
                OR payload #> '{payload,source,hostRasterData}' IS NOT NULL) THEN
    RAISE EXCEPTION 'Demo template still references DRAW raster';
  END IF;
  IF (SELECT count(*) FROM public.storage_cleanup_queue WHERE bucket = 'user-logos') <> 2
     OR EXISTS (SELECT 1 FROM public.storage_cleanup_queue WHERE path LIKE '%keep-image.png') THEN
    RAISE EXCEPTION 'DRAW file cleanup queue contains unexpected paths';
  END IF;
END
$$;

SELECT 'DRAW PNG reference cleanup migration OK' AS result;
