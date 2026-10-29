-- Migration 272: atomowy reset ankiety przed edycją + osierocone kopie gier
-- ze Społeczności (audyt strony /games, e2e/games.spec.js)
--
-- 1) game_reset_poll_for_edit(p_game_id)
--    games.js i editor.js cofały ankietę do szkicu kilkoma osobnymi
--    zapisami (status -> draft, potem fixed_points = 0). Błąd między nimi
--    zostawiał grę jako szkic z punktami z zamkniętej ankiety. Teraz to
--    jedna funkcja = jedna transakcja. Blokady (edit_locks) sprawdza nadal
--    strona przed wywołaniem -- edytor woła reset, zanim sam weźmie lock.
--
-- 2) Kopie gier ze Społeczności (type = 'market') po usunięciu gry z
--    market_games dostawały source_market_id = NULL (FK ON DELETE SET NULL)
--    i znikały z każdej zakładki /games (lista pomija typ 'market', a
--    biblioteka ich już nie ma) -- gra wciąż istniała, ale nie dało się jej
--    zobaczyć ani usunąć. Taka kopia staje się zwykłą grą preparowaną
--    (status 'ready' jest dla prepared dozwolony, games_poll_status_ok).

create or replace function public.game_reset_poll_for_edit(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_game record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type, status into v_game
  from public.games
  where id = p_game_id and owner_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  -- otwartej ankiety nie resetujemy spod ręki głosujących
  if v_game.status = 'poll_open' then
    return jsonb_build_object('ok', false, 'error', 'poll_open');
  end if;

  if v_game.type not in ('poll_text', 'poll_points') then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.games
     set status = 'draft', poll_opened_at = null, poll_closed_at = null
   where id = p_game_id;

  update public.answers a
     set fixed_points = 0
    from public.questions q
   where q.id = a.question_id
     and q.game_id = p_game_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

revoke all on function public.game_reset_poll_for_edit(uuid) from public, anon;
grant execute on function public.game_reset_poll_for_edit(uuid) to authenticated;

create or replace function public.games_market_orphan_to_prepared()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.type = 'market' and new.source_market_id is null and old.source_market_id is not null then
    new.type := 'prepared';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_games_market_orphan_to_prepared on public.games;
create trigger trg_games_market_orphan_to_prepared
  before update of source_market_id on public.games
  for each row execute function public.games_market_orphan_to_prepared();

-- istniejące sieroty
update public.games
   set type = 'prepared'
 where type = 'market'
   and source_market_id is null;

notify pgrst, 'reload schema';
