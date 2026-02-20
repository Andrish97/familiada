-- Reuse one canonical deletion routine for both account deletion and guest cleanup
-- + random guest username in range 1..999999 with availability check.

create or replace function public.delete_user_everything(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- explicit cleanup (safe even if some rows are already gone)
  delete from public.poll_text_entries where voter_user_id = p_user_id;
  delete from public.poll_votes where voter_user_id = p_user_id;

  delete from public.poll_subscriptions where subscriber_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- profile first (also cascades by FK from auth.users if still present)
  delete from public.profiles where id = p_user_id;

  -- final auth user hard delete
  delete from auth.users where id = p_user_id;
end;
$$;

create or replace function public.guest_cleanup_expired(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted int := 0;
  v_id uuid;
begin
  for v_id in
    select p.id
    from public.profiles p
    where p.is_guest = true
      and p.guest_expires_at is not null
      and p.guest_expires_at < now()
    order by p.guest_expires_at asc
    limit v_limit
  loop
    perform public.delete_user_everything(v_id);
    v_deleted := v_deleted + 1;
  end loop;

  return v_deleted;
end;
$$;

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
    loop
      v_num := 1 + floor(random() * 999999)::int;
      v_username := 'guest_' || lpad(v_num::text, 6, '0');
      exit when not exists (
        select 1 from public.profiles p
        where lower(p.username) = lower(v_username)
          and p.id <> new.id
      );
      v_try := v_try + 1;
      exit when v_try > 100;
    end loop;

    if v_try > 100 then
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
