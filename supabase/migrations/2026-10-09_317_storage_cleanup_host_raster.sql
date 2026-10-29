-- 317: kolejka sprzątania Storage (313) obejmuje też obraz Hosta logo
-- (payload.source.hostRasterUrl, „Render DRAW Host logos as stored PNG masks”)
-- + podgląd kolejki dla e2e (tylko konta testowe) do diagnozy.
BEGIN;

CREATE OR REPLACE FUNCTION public._logo_url_path(p_url text, p_user uuid) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  select case when p like (p_user::text || '/%') then p end
  from (select split_part(split_part(coalesce(p_url, ''), '/user-logos/', 2), '?', 1) as p) x
$$;
REVOKE ALL ON FUNCTION public._logo_url_path(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._storage_cleanup_on_logo_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_path text;
begin
  for v_path in
    select distinct p from (values
      (public._logo_url_path(old.payload #>> '{source,imageUrl}', old.user_id)),
      (public._logo_url_path(old.payload #>> '{source,hostRasterUrl}', old.user_id))
    ) t(p) where p is not null
  loop
    insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
    values ('user-logos', v_path, false, 'logo', old.id);
  end loop;
  return old;
end;
$$;

-- Plik nadal używany przez inny wiersz logo (obraz albo raster Hosta) nie jest kasowany.
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
              or public._logo_url_path(l.payload #>> '{source,imageUrl}', l.user_id) = q.path
              or public._logo_url_path(l.payload #>> '{source,hostRasterUrl}', l.user_id) = q.path));

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

-- Diagnoza e2e: wpisy kolejki dotyczące gier/logo wołającego (tylko konta testowe).
CREATE OR REPLACE FUNCTION public.e2e_storage_cleanup_peek(p_owner_id uuid)
RETURNS TABLE(bucket text, path text, attempts integer, last_error text, created_at timestamptz, claimed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null or v_email !~ '^test[0-9]+@familiada[.]online$' then
    raise exception 'e2e_only';
  end if;
  return query
  select q.bucket, q.path, q.attempts, q.last_error, q.created_at, q.claimed_at
  from public.storage_cleanup_queue q
  where q.owner_id = p_owner_id and q.path like (auth.uid()::text || '%');
end;
$$;
REVOKE ALL ON FUNCTION public.e2e_storage_cleanup_peek(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_storage_cleanup_peek(uuid) TO authenticated;

COMMIT;
