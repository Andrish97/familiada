-- =========================
-- Bases share invites/tasks
-- =========================

-- 1) Tabela z zaproszeniami (pending/accepted/declined/cancelled)
create table if not exists public.base_share_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  base_id uuid not null,
  recipient_user_id uuid,
  recipient_email text,
  role public.base_share_role not null default 'viewer'::public.base_share_role,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  email_sent_at timestamptz,
  email_send_count integer not null default 0
);

create index if not exists base_share_tasks_owner_base_idx
  on public.base_share_tasks (owner_id, base_id);

create index if not exists base_share_tasks_recipient_idx
  on public.base_share_tasks (recipient_user_id);

create index if not exists base_share_tasks_token_idx
  on public.base_share_tasks (token);

create index if not exists base_share_tasks_status_created_idx
  on public.base_share_tasks (status, created_at);


-- 2) Helper: cleanup pending po 5 dniach (usuwamy niezaakceptowane)
create or replace function public.base_share_tasks_cleanup()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.base_share_tasks
  where status in ('pending','opened')
    and created_at < now() - interval '5 days';
end;
$$;


-- 3) RPC: licznik przychodzących propozycji (do badge w builderze)
create or replace function public.bases_count_incoming_share_invites()
returns integer
language plpgsql
security definer
as $$
declare
  v_cnt integer;
begin
  perform public.base_share_tasks_cleanup();

  select count(*)::int into v_cnt
  from public.base_share_tasks t
  where t.recipient_user_id = auth.uid()
    and t.status in ('pending','opened');

  return coalesce(v_cnt, 0);
end;
$$;


-- 4) RPC: listowanie "moich udostępnionych baz" + propozycje (pending)
-- UWAGA: rozszerzamy istniejący kontrakt o pola:
-- proposed(bool), task_id(uuid), task_status(text), proposed_role(base_share_role)
create or replace function public.list_shared_bases_ext()
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_username text,
  owner_email text,
  created_at timestamptz,
  updated_at timestamptz,
  shared_role public.base_share_role,

  proposed boolean,
  task_id uuid,
  task_status text,
  proposed_role public.base_share_role
)
language plpgsql
security definer
as $$
begin
  perform public.base_share_tasks_cleanup();

  -- A) zaakceptowane udostępnienia (jak dotychczas)
  return query
  select
    b.id,
    b.name,
    b.owner_id,
    p.username as owner_username,
    p.email as owner_email,
    b.created_at,
    b.updated_at,
    s.role as shared_role,

    false as proposed,
    null::uuid as task_id,
    null::text as task_status,
    null::public.base_share_role as proposed_role
  from public.question_base_shares s
  join public.question_bases b on b.id = s.base_id
  join public.profiles p on p.id = b.owner_id
  where s.user_id = auth.uid();

  -- B) propozycje (pending/opened) – widoczne jako "żółtawa"
  return query
  select
    b.id,
    b.name,
    b.owner_id,
    p.username as owner_username,
    p.email as owner_email,
    b.created_at,
    b.updated_at,
    null::public.base_share_role as shared_role,

    true as proposed,
    t.id as task_id,
    t.status as task_status,
    t.role as proposed_role
  from public.base_share_tasks t
  join public.question_bases b on b.id = t.base_id
  join public.profiles p on p.id = t.owner_id
  where t.recipient_user_id = auth.uid()
    and t.status in ('pending','opened');
end;
$$;


-- 5) RPC: listowanie udostępnień dla ownera (accepted) – DODAJEMY username
-- 1) Usuń starą wersję (jeśli istnieje)
drop function if exists public.list_shared_bases_ext();

-- 2) Utwórz nową (ta wersja z rozszerzonym return table)
create or replace function public.list_shared_bases_ext()
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_username text,
  owner_email text,
  created_at timestamptz,
  updated_at timestamptz,
  shared_role public.base_share_role,

  proposed boolean,
  task_id uuid,
  task_status text,
  proposed_role public.base_share_role
)
language plpgsql
security definer
as $$
begin
  perform public.base_share_tasks_cleanup();

  return query
  select
    b.id,
    b.name,
    b.owner_id,
    p.username as owner_username,
    p.email as owner_email,
    b.created_at,
    b.updated_at,
    s.role as shared_role,

    false as proposed,
    null::uuid as task_id,
    null::text as task_status,
    null::public.base_share_role as proposed_role
  from public.question_base_shares s
  join public.question_bases b on b.id = s.base_id
  join public.profiles p on p.id = b.owner_id
  where s.user_id = auth.uid();

  return query
  select
    b.id,
    b.name,
    b.owner_id,
    p.username as owner_username,
    p.email as owner_email,
    b.created_at,
    b.updated_at,
    null::public.base_share_role as shared_role,

    true as proposed,
    t.id as task_id,
    t.status as task_status,
    t.role as proposed_role
  from public.base_share_tasks t
  join public.question_bases b on b.id = t.base_id
  join public.profiles p on p.id = t.owner_id
  where t.recipient_user_id = auth.uid()
    and t.status in ('pending','opened');
end;
$$;


-- 6) RPC: listowanie pending/outgoing (dla sekcji "Oczekujące" w modalu)
create or replace function public.list_base_share_tasks_outgoing(p_base_id uuid)
returns table (
  id uuid,
  recipient_user_id uuid,
  recipient_email text,
  recipient_username text,
  role public.base_share_role,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_owner uuid;
begin
  perform public.base_share_tasks_cleanup();

  select owner_id into v_owner
  from public.question_bases
  where id = p_base_id;

  if v_owner is null or v_owner <> auth.uid() then
    return;
  end if;

  return query
  select
    t.id,
    t.recipient_user_id,
    t.recipient_email,
    pr.username as recipient_username,
    t.role,
    t.status,
    t.created_at
  from public.base_share_tasks t
  left join public.profiles pr on pr.id = t.recipient_user_id
  where t.base_id = p_base_id
    and t.owner_id = auth.uid()
    and t.status in ('pending','opened')
  order by t.created_at desc;
end;
$$;


-- 7) RPC: create invite (email) – COOLDOWN 24h po declined/cancelled/revoke
-- Zwraca: ok + ewentualnie "mail payload" (to/link/baseName/ownerLabel)
create or replace function public.base_share_by_email(p_base_id uuid, p_email text, p_role public.base_share_role)
returns table (
  ok boolean,
  err text,
  mail_to text,
  mail_link text,
  base_name text,
  owner_label text
)
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_recipient uuid;
  v_norm_email text;
  v_base_name text;
  v_owner_label text;
  v_last_ts timestamptz;
  v_task public.base_share_tasks%rowtype;
begin
  perform public.base_share_tasks_cleanup();

  v_norm_email := lower(trim(p_email));

  select owner_id, name into v_owner, v_base_name
  from public.question_bases
  where id = p_base_id;

  if v_owner is null or v_owner <> auth.uid() then
    return query select false, 'not_owner', null, null, null, null;
    return;
  end if;

  -- recipient po email
  select id into v_recipient
  from public.profiles
  where lower(email) = v_norm_email;

  if v_recipient is null then
    -- nie ujawniamy detali -> ok=false
    return query select false, 'unknown_user', null, null, null, null;
    return;
  end if;

  if v_recipient = v_owner then
    return query select false, 'owner', null, null, null, null;
    return;
  end if;

  -- jeśli już jest share -> tylko update roli (bez invite)
  if exists (
    select 1 from public.question_base_shares s
    where s.base_id = p_base_id and s.user_id = v_recipient
  ) then
    update public.question_base_shares
      set role = p_role
    where base_id = p_base_id and user_id = v_recipient;

    return query select true, null, null, null, v_base_name, null;
    return;
  end if;

  -- cooldown: ostatnie cancelled/declined/revoked (my: owner + base + recipient)
  select greatest(
    max(t.declined_at),
    max(t.cancelled_at)
  ) into v_last_ts
  from public.base_share_tasks t
  where t.owner_id = v_owner
    and t.base_id = p_base_id
    and t.recipient_user_id = v_recipient
    and t.status in ('declined','cancelled');

  if v_last_ts is not null and v_last_ts > now() - interval '24 hours' then
    return query select false, 'cooldown', null, null, null, null;
    return;
  end if;

  -- jeśli jest już aktywny pending/opened -> blokuj
  if exists (
    select 1 from public.base_share_tasks t
    where t.owner_id = v_owner
      and t.base_id = p_base_id
      and t.recipient_user_id = v_recipient
      and t.status in ('pending','opened')
  ) then
    return query select false, 'already_pending', null, null, null, null;
    return;
  end if;

  -- label ownera do maila
  select coalesce(pr.username, pr.email) into v_owner_label
  from public.profiles pr
  where pr.id = v_owner;

  insert into public.base_share_tasks(owner_id, base_id, recipient_user_id, recipient_email, role, status)
  values (v_owner, p_base_id, v_recipient, v_norm_email, p_role, 'pending')
  returning * into v_task;

  -- link do bases.html z tokenem
  return query
  select
    true as ok,
    null as err,
    v_norm_email as mail_to,
    ('/bases.html?share=' || v_task.token::text) as mail_link,
    v_base_name as base_name,
    v_owner_label as owner_label;
end;
$$;


-- 8) RPC: cancel outgoing (X w "Oczekujące") – i zaczyna cooldown 24h
create or replace function public.base_share_cancel_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.base_share_tasks
  where id = p_task_id;

  if v_owner is null or v_owner <> auth.uid() then
    return false;
  end if;

  update public.base_share_tasks
    set status = 'cancelled',
        cancelled_at = now()
  where id = p_task_id
    and status in ('pending','opened');

  return true;
exception when others then
  return false;
end;
$$;


-- 9) RPC: accept/decline incoming (na "żółtawym" kafelku)
create or replace function public.base_share_accept(p_task_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  t public.base_share_tasks%rowtype;
begin
  select * into t
  from public.base_share_tasks
  where id = p_task_id;

  if t.id is null then return false; end if;
  if t.recipient_user_id <> auth.uid() then return false; end if;
  if t.status not in ('pending','opened') then return false; end if;

  insert into public.question_base_shares(base_id, user_id, role)
  values (t.base_id, auth.uid(), t.role)
  on conflict (base_id, user_id) do update set role = excluded.role;

  update public.base_share_tasks
    set status = 'done',
        accepted_at = now()
  where id = t.id;

  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.base_share_decline(p_task_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.base_share_tasks
    set status = 'declined',
        declined_at = now()
  where id = p_task_id
    and recipient_user_id = auth.uid()
    and status in ('pending','opened');

  return true;
exception when others then
  return false;
end;
$$;


-- 10) ZMIANA: revoke_base_share zapisuje cooldown (status=cancelled)
create or replace function public.revoke_base_share(p_base_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_email text;
begin
  select owner_id into v_owner
  from public.question_bases
  where id = p_base_id;

  if v_owner is null or v_owner <> auth.uid() then
    return false;
  end if;

  select lower(email) into v_email
  from public.profiles
  where id = p_user_id;

  delete from public.question_base_shares
  where base_id = p_base_id
    and user_id = p_user_id;

  -- cooldown marker (bez tokena – to nie jest aktywne invite, tylko blokada)
  insert into public.base_share_tasks(owner_id, base_id, recipient_user_id, recipient_email, role, status, cancelled_at)
  values (v_owner, p_base_id, p_user_id, v_email, 'viewer', 'cancelled', now());

  return true;
exception when others then
  return false;
end;
$$;
