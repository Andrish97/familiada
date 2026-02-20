-- Guest accounts support (Supabase)
-- - profile flags/TTL for guests
-- - helper RPCs for touch/expiry/cleanup
-- - handle_new_user: guest username + synthetic email fallback

alter table public.profiles
  add column if not exists is_guest boolean not null default false,
  add column if not exists guest_last_active_at timestamptz,
  add column if not exists guest_expires_at timestamptz;

create index if not exists profiles_guest_expires_idx
  on public.profiles (guest_expires_at)
  where is_guest = true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_username text;
  v_is_guest boolean;
  v_last_active timestamptz;
  v_expires_at timestamptz;
  v_num int;
  v_try int := 0;
begin
  v_is_guest := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false);

  v_email := lower(coalesce(new.email, ''));
  if v_email = '' and v_is_guest then
    v_email := 'guest_' || replace(new.id::text, '-', '') || '@guest.local';
  end if;

  v_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if v_username = '' then
    v_username := null;
  end if;

  if v_is_guest and v_username is null then
    v_num := abs(('x' || substr(md5(new.id::text), 1, 8))::bit(32)::int) % 1000000;

    loop
      v_username := 'guest_' || lpad(v_num::text, 6, '0');
      exit when not exists (
        select 1 from public.profiles p
        where lower(p.username) = lower(v_username)
          and p.id <> new.id
      );
      v_num := (v_num + 1) % 1000000;
      v_try := v_try + 1;
      exit when v_try > 50;
    end loop;

    if v_try > 50 then
      v_username := 'guest_' || substr(replace(new.id::text, '-', ''), 1, 12);
    end if;
  end if;

  if v_is_guest then
    v_last_active := now();
    v_expires_at := now() + interval '5 days';
  else
    v_last_active := null;
    v_expires_at := null;
  end if;

  insert into public.profiles (id, email, username, is_guest, guest_last_active_at, guest_expires_at)
  values (new.id, v_email, v_username, v_is_guest, v_last_active, v_expires_at)
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(excluded.username, public.profiles.username),
        is_guest = excluded.is_guest,
        guest_last_active_at = excluded.guest_last_active_at,
        guest_expires_at = excluded.guest_expires_at;

  return new;
end;
$$;

create or replace function public.guest_touch(p_ttl_days integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_days int := greatest(1, least(coalesce(p_ttl_days, 5), 30));
  v_count int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.profiles
     set guest_last_active_at = now(),
         guest_expires_at = now() + make_interval(days => v_days)
   where id = v_uid
     and is_guest = true;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  return jsonb_build_object('ok', true, 'ttl_days', v_days);
end;
$$;

grant execute on function public.guest_touch(integer) to authenticated;

create or replace function public.guest_is_expired(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(p.is_guest, false)
         and coalesce(p.guest_expires_at <= now(), false)
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.guest_is_expired(uuid) to authenticated;

create or replace function public.guest_cleanup_expired(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted int := 0;
begin
  with doomed as (
    select p.id
    from public.profiles p
    where p.is_guest = true
      and p.guest_expires_at is not null
      and p.guest_expires_at < now()
    order by p.guest_expires_at asc
    limit v_limit
  ), del as (
    delete from auth.users u
    using doomed d
    where u.id = d.id
    returning 1
  )
  select count(*) into v_deleted from del;

  return v_deleted;
end;
$$;

-- Intentionally no grant for authenticated users.
