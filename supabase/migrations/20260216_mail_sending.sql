--mail_settings — globalna konfiguracja bez redeploy
create table if not exists public.mail_settings (
  id int primary key default 1,
  queue_enabled boolean not null default true,
  provider_order text not null default 'sendgrid,brevo,mailgun',
  delay_ms int not null default 250,
  batch_max int not null default 100,
  updated_at timestamptz not null default now(),
  constraint mail_settings_singleton check (id = 1)
);

insert into public.mail_settings (id)
values (1)
on conflict (id) do nothing;


--RLS dla mail_settings
alter table public.mail_settings enable row level security;

create policy "mail_settings_read_none"
on public.mail_settings
for select
to authenticated
using (false);

create policy "mail_settings_write_none"
on public.mail_settings
for all
to authenticated
using (false)
with check (false);


--mail_queue — kolejka (to, subject, html + meta)
create table if not exists public.mail_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null,

  to_email text not null,
  subject text not null,
  html text not null,

  status text not null default 'pending', -- pending|sending|sent|failed|cancelled
  not_before timestamptz not null default now(),
  attempts int not null default 0,
  last_error text null,

  provider_used text null,
  provider_order text null,

  meta jsonb not null default '{}'::jsonb
);

create index if not exists mail_queue_pick_idx
  on public.mail_queue (status, not_before, created_at);

create index if not exists mail_queue_created_by_idx
  on public.mail_queue (created_by, created_at desc);
  

--RPC do “pobrania paczki do wysyłki” — worker
create or replace function public.mail_queue_pick(p_limit int)
returns setof public.mail_queue
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with cte as (
    select id
    from public.mail_queue
    where status = 'pending'
      and not_before <= now()
    order by created_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  update public.mail_queue q
  set status = 'sending',
      attempts = attempts + 1
  from cte
  where q.id = cte.id
  returning q.*;
end;
$$;


--I osobne RPC do “mark sent/failed”:
create or replace function public.mail_queue_mark(p_id uuid, p_ok boolean, p_provider text, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.mail_queue
  set status = case when p_ok then 'sent' else 'failed' end,
      provider_used = p_provider,
      last_error = case when p_ok then null else left(coalesce(p_error,''), 2000) end
  where id = p_id;
end;
$$;

