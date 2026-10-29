-- Migracja 402: „ankieta” zamiast „sondażu” w tekstach funkcji.
-- Uruchomienie: lokalna baza wg docs/sql/local-db.md (schema.sql bez 402),
-- potem z katalogu repo: psql ... -d fam -f tests/sql/poll-wording-402.sql
\set ON_ERROR_STOP 1
begin;
\ir ../../supabase/migrations/2026-10-20_402_poll_wording_ankieta.sql
do $$
declare f text; d text;
begin
  foreach f in array array['public.tasks_list(text)','public.game_action_state(uuid)','public.poll_admin_can_close(uuid)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if d ~* 'sonda' then raise exception '%: nadal zawiera „sonda…”', f; end if;
  end loop;
  if position('''Ankieta ''||' in pg_get_functiondef('public.tasks_list(text)'::regprocedure)) = 0 then raise exception 'tasks_list: brak „Ankieta”'; end if;
  if position('Ankieta nie jest otwarta.' in pg_get_functiondef('public.poll_admin_can_close(uuid)'::regprocedure)) = 0 then raise exception 'poll_admin_can_close: brak nowego komunikatu'; end if;
  if position('Gra dostępna dopiero po zamknięciu ankiety.' in pg_get_functiondef('public.game_action_state(uuid)'::regprocedure)) = 0 then raise exception 'game_action_state: brak nowego komunikatu'; end if;
end $$;
select 'poll-wording-402: OK' as wynik;
rollback;
