begin;

alter table public.profiles
  alter column username drop not null;

drop trigger if exists trg_profiles_username_immutable on public.profiles;
drop function if exists public.profiles_username_immutable();

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_email text;
  v_username text;
begin
  v_email := lower(coalesce(new.email, ''));

  v_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if v_username = '' then
    v_username := null;
  end if;

  insert into public.profiles (id, email, username)
  values (new.id, v_email, v_username)
  on conflict (id) do update
    set email = excluded.email,
        username = excluded.username;

  return new;
end;
$function$;

drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (true);

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

commit;
