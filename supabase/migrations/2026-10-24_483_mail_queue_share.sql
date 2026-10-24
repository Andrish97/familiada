-- 483: podział dziennego limitu dostawcy ustawiany w panelu admina.
-- queue_share_pct — część limitu na kolejkę (mail-worker), reszta to rezerwa
-- na maile wysyłane od razu (send-email: konto, hasło, zmiana adresu).
-- Maile od razu biorą najpierw ze swojej rezerwy, potem z puli kolejki
-- (rezerwa działa w jedną stronę: kolejka nie sięga po rezerwę).

alter table public.mail_settings
  add column if not exists queue_share_pct integer not null default 80;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mail_settings_queue_share_pct_range') then
    alter table public.mail_settings
      add constraint mail_settings_queue_share_pct_range check (queue_share_pct between 50 and 95);
  end if;
end $$;

create or replace function public.reset_email_limits()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_share numeric := coalesce((select queue_share_pct from public.mail_settings where id = 1), 80) / 100.0;
begin
  update public.email_providers
  set rem_worker = floor(daily_limit * v_share),
      rem_immediate = daily_limit - floor(daily_limit * v_share)
  where is_active = true;
end;
$$;

-- Zwraca 'immediate' | 'worker' | 'none' — z której puli zdjęto jeden mail.
create or replace function public.take_provider_immediate(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pool text;
begin
  update public.email_providers
  set rem_immediate = rem_immediate - 1
  where id = p_id and rem_immediate > 0
  returning 'immediate' into v_pool;
  if v_pool is not null then return v_pool; end if;

  update public.email_providers
  set rem_worker = rem_worker - 1
  where id = p_id and rem_worker > 0
  returning 'worker' into v_pool;
  return coalesce(v_pool, 'none');
end;
$$;

revoke execute on function public.take_provider_immediate(uuid) from public, anon, authenticated;
grant execute on function public.take_provider_immediate(uuid) to service_role;
