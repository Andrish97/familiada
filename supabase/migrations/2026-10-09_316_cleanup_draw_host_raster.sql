-- 315: Include the derived DRAW Host PNG in the existing logo Storage cleanup.
-- The raster is stored in user-logos and referenced by payload.source.hostRasterUrl.
-- No table or bucket changes are needed.
BEGIN;

CREATE OR REPLACE FUNCTION public._logo_host_raster_path(p_payload jsonb, p_user uuid) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  select case when p like (p_user::text || '/%') then p end
  from (
    select split_part(split_part(coalesce(p_payload #>> '{source,hostRasterUrl}', ''), '/user-logos/', 2), '?', 1) as p
  ) x
$$;

CREATE OR REPLACE FUNCTION public._storage_cleanup_on_logo_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
  select 'user-logos', p.path, false, 'logo', old.id
  from (values
    (public._logo_image_path(old.payload, old.user_id)),
    (public._logo_host_raster_path(old.payload, old.user_id))
  ) as p(path)
  where p.path is not null
  on conflict do nothing;
  return old;
end;
$$;

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
              or public._logo_image_path(l.payload, l.user_id) = q.path
              or public._logo_host_raster_path(l.payload, l.user_id) = q.path));

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

REVOKE ALL ON FUNCTION public._logo_host_raster_path(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storage_cleanup_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_cleanup_claim(integer) TO service_role;

COMMIT;
