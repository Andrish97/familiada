begin;

create table if not exists public.email_intents (
  email text primary key,
  intent text not null check (intent in ('signup', 'guest_migrate')),
  status text not null check (status in ('pending', 'confirmed', 'expired')),
  cooldown_until timestamptz,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_intents_status_idx on public.email_intents(status);
create index if not exists email_intents_cooldown_idx on public.email_intents(cooldown_until);

alter table public.email_intents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_intents'
      and policyname = 'email_intents_service_only'
  ) then
    execute $p$
      create policy email_intents_service_only
      on public.email_intents
      as permissive
      for all
      to authenticated
      using (false)
      with check (false)
    $p$;
  end if;
end
$$;

create or replace function public.email_intents_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_email_intents_set_updated_at on public.email_intents;
create trigger trg_email_intents_set_updated_at
before update on public.email_intents
for each row execute function public.email_intents_set_updated_at();

create or replace function public.email_get_status(p_email text)
returns table(status text, intent text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user record;
  v_intent record;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return query select 'none'::text, 'signup'::text;
    return;
  end if;

  select
    u.id,
    u.email_confirmed_at,
    coalesce(u.raw_user_meta_data->>'familiada_email_change_intent', '') as meta_intent
  into v_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if found then
    if v_user.email_confirmed_at is not null then
      return query select 'confirmed'::text, 'signup'::text;
    else
      return query
      select
        'pending'::text,
        case when lower(v_user.meta_intent) = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
    end if;
    return;
  end if;

  select
    ei.status,
    ei.intent,
    ei.cooldown_until
  into v_intent
  from public.email_intents ei
  where ei.email = v_email
  limit 1;

  if found then
    if v_intent.status = 'confirmed' then
      return query select 'confirmed'::text, 'signup'::text;
      return;
    end if;
    if v_intent.status = 'pending' then
      return query
      select
        'pending'::text,
        case when v_intent.intent = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
      return;
    end if;
  end if;

  return query select 'none'::text, 'signup'::text;
end;
$$;

create or replace function public.email_resend_prepare(p_email text, p_intent text default null)
returns table(ok boolean, nextallowedat timestamptz, status text, intent text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_requested_intent text := lower(trim(coalesce(p_intent, '')));
  v_status text := 'none';
  v_existing_intent text := 'signup';
  v_final_intent text := 'signup';
  v_cooldown_until timestamptz;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return query select false, null::timestamptz, 'none'::text, 'signup'::text;
    return;
  end if;

  select s.status, s.intent into v_status, v_existing_intent
  from public.email_get_status(v_email) s
  limit 1;

  if v_requested_intent in ('signup', 'guest_migrate') then
    v_final_intent := v_requested_intent;
  elsif v_existing_intent in ('signup', 'guest_migrate') then
    v_final_intent := v_existing_intent;
  end if;

  if v_status = 'confirmed' then
    return query select false, null::timestamptz, 'confirmed'::text, v_final_intent;
    return;
  end if;

  select cooldown_until into v_cooldown_until
  from public.email_intents
  where email = v_email
  limit 1;

  if v_cooldown_until is not null and v_cooldown_until > now() then
    return query select false, v_cooldown_until, 'pending'::text, v_final_intent;
    return;
  end if;

  insert into public.email_intents (email, intent, status, cooldown_until)
  values (v_email, v_final_intent, 'pending', now() + interval '1 hour')
  on conflict (email) do update set
    intent = excluded.intent,
    status = 'pending',
    cooldown_until = excluded.cooldown_until,
    updated_at = now();

  return query select true, now() + interval '1 hour', 'pending'::text, v_final_intent;
end;
$$;

create or replace function public.email_mark_confirmed(p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_auth_email text := '';
begin
  if v_email = '' then
    return;
  end if;

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = auth.uid()
  limit 1;

  if v_auth_email = '' or v_auth_email <> v_email then
    return;
  end if;

  insert into public.email_intents (email, intent, status, cooldown_until)
  values (v_email, 'signup', 'confirmed', null)
  on conflict (email) do update set
    status = 'confirmed',
    cooldown_until = null,
    updated_at = now();
end;
$$;

revoke all on function public.email_get_status(text) from public;
revoke all on function public.email_resend_prepare(text, text) from public;
revoke all on function public.email_mark_confirmed(text) from public;

grant execute on function public.email_get_status(text) to authenticated;
grant execute on function public.email_resend_prepare(text, text) to authenticated;
grant execute on function public.email_mark_confirmed(text) to authenticated;

commit;
