begin;

-- 1) Nowa globalna flaga: czy wysyłać maile do usera
alter table public.user_flags
  add column if not exists email_notifications boolean not null default true;

comment on column public.user_flags.email_notifications is
  'If true, user receives email notifications (subscription invites, vote tasks, base shares).';

-- 2) (Opcjonalnie, ale praktycznie konieczne) RLS policies dla user_flags,
-- bo RLS jest włączone, a bez policy nie odczytasz/nie zaktualizujesz wprost z klienta.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_flags' and policyname='user_flags_select_own'
  ) then
    execute $p$
      create policy user_flags_select_own
      on public.user_flags
      for select
      to authenticated
      using (user_id = auth.uid())
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_flags' and policyname='user_flags_insert_own'
  ) then
    execute $p$
      create policy user_flags_insert_own
      on public.user_flags
      for insert
      to authenticated
      with check (user_id = auth.uid())
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_flags' and policyname='user_flags_update_own'
  ) then
    execute $p$
      create policy user_flags_update_own
      on public.user_flags
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid())
    $p$;
  end if;
end$$;

commit;
