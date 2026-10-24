-- 481: funkcje, których nie ma sensu wołać przez API, bez EXECUTE dla ról API
-- (docs/utwardzenie-bazy-plan.md). RPC strony bez zmian.
-- 1) Wszystkie funkcje wyzwalaczy w public (zwracają trigger): wyzwalacz
--    działa bez EXECUTE wywołującego, a wywołanie z API i tak kończy się błędem.
-- 2) _game_control_active — pomocnicza, wołana tylko z funkcji SECURITY DEFINER
--    (game_change_type, game_reset_poll_for_edit, game_validate, guard_game_content).

do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    n := n + 1;
  end loop;
  raise notice 'funkcje wyzwalaczy bez EXECUTE dla API: %', n;
end
$$;

revoke execute on function public._game_control_active(uuid) from public, anon, authenticated;
