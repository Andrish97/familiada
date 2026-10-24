-- Migracje 480–481: stała search_path, funkcje wyzwalaczy bez EXECUTE dla API.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracje 480, 481).
\set ON_ERROR_STOP 1
begin;
\set a '48000000-0000-4000-8000-00000000000a'
insert into auth.users(id,email) values (:'a','a480@example.com');
insert into public.profiles(id,username,email) values (:'a','ala480','a480@example.com') on conflict (id) do nothing;
-- schemat lokalny nie ma GRANT-ów tabel: jak na produkcji (Supabase)
grant usage on schema auth to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
grant select, insert, update, delete on public.games to authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_graphql') then raise exception 'pg_graphql nadal włączony'; end if;
  if has_function_privilege('authenticated', 'public.touch_updated_at()', 'execute') then raise exception 'wyzwalacz touch_updated_at wykonywalny przez API'; end if;
  if has_function_privilege('anon', 'public._game_control_active(uuid)', 'execute') then raise exception '_game_control_active wykonywalna przez anon'; end if;
  if not has_function_privilege('authenticated', 'public.gen_share_key(integer)', 'execute') then raise exception 'gen_share_key (DEFAULT kolumn) bez EXECUTE'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'game_state_write'
               and not ('search_path=public, extensions, pg_temp' = any(coalesce(p.proconfig, '{}')))) then
    raise exception 'game_state_write bez stałej search_path';
  end if;
end $$;
select set_config('request.jwt.claim.sub', :'a', true);
set local role authenticated;
-- Wyzwalacze BEFORE INSERT/UPDATE i AFTER DELETE gier działają bez EXECUTE roli.
insert into public.games(id, owner_id, name) values ('48000000-0000-4000-8000-0000000000a1', :'a', 'Gra 480');
update public.games set name = 'Gra 480b' where id = '48000000-0000-4000-8000-0000000000a1';
do $$ declare k text; begin
  select share_key_control into k from public.games where id = '48000000-0000-4000-8000-0000000000a1';
  if coalesce(length(k), 0) < 10 then raise exception 'klucz udostępnienia nie wygenerowany'; end if;
end $$;
delete from public.games where id = '48000000-0000-4000-8000-0000000000a1';
-- Wywołanie funkcji wyzwalacza z API: brak uprawnień.
do $$ begin
  perform public.touch_updated_at();
  raise exception 'touch_updated_at dała się wywołać';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
\echo 'db-hardening-480-481: OK'
