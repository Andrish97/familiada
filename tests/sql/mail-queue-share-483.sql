-- Migracja 483: podział limitu z ustawień i rezerwa „od razu” sięgająca do puli kolejki.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracja 483).
\set ON_ERROR_STOP 1
begin;
insert into public.mail_settings(id) values (1) on conflict (id) do nothing;
update public.mail_settings set queue_share_pct = 70 where id = 1;
insert into public.email_providers(id, name, label, priority, daily_limit, rem_worker, rem_immediate, is_active)
values ('48300000-0000-4000-8000-000000000001', 'test483', 'Test 483', 99, 10, 0, 0, true);
select public.reset_email_limits();
do $$ declare w int; i int; p text; begin
  select rem_worker, rem_immediate into w, i from public.email_providers where id = '48300000-0000-4000-8000-000000000001';
  if (w, i) <> (7, 3) then raise exception 'podział 70%%: oczekiwano 7/3, jest %/%', w, i; end if;
  for n in 1..3 loop
    p := public.take_provider_immediate('48300000-0000-4000-8000-000000000001');
    if p <> 'immediate' then raise exception 'próba %: oczekiwano immediate, jest %', n, p; end if;
  end loop;
  p := public.take_provider_immediate('48300000-0000-4000-8000-000000000001');
  if p <> 'worker' then raise exception 'po rezerwie: oczekiwano worker, jest %', p; end if;
  update public.email_providers set rem_worker = 0 where id = '48300000-0000-4000-8000-000000000001';
  p := public.take_provider_immediate('48300000-0000-4000-8000-000000000001');
  if p <> 'none' then raise exception 'bez limitu: oczekiwano none, jest %', p; end if;
  if has_function_privilege('anon', 'public.take_provider_immediate(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.take_provider_immediate(uuid)', 'execute') then
    raise exception 'take_provider_immediate dostępna przez API';
  end if;
end $$;
do $$ begin
  update public.mail_settings set queue_share_pct = 40 where id = 1;
  raise exception 'próg 40%% przyjęty';
exception when check_violation then null;
end $$;
rollback;
\echo 'mail-queue-share-483: OK'
