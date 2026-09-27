-- Migration 274: Warstwa 2 dla reguł gry -- baza sama odrzuca zapis
--
-- game_validate (migracja 273) to Warstwa 1: strona pyta, czy wolno, i
-- wyłącza przyciski / pokazuje komunikat. Tak jak przy blokadach użycia
-- (docs/plan-testy-i-poprawki.md, "Dwie warstwy ochrony") to tylko UX --
-- druga karta otwarta wcześniej, stara wersja strony z cache albo wywołanie
-- wprost przez API omija ją bez trudu. Znana luka z tego dokumentu:
-- "canEnterEdit()/poll_open w edytorze -- Warstwa 1 istnieje, Warstwa 2
-- zero" (edytor otwarty jako szkic dalej zapisywał pytania, gdy ankietę
-- właśnie otworzono w innej karcie).
--
-- 1) Treść gry (questions, answers): zapis wprost z przeglądarki
--    (rola authenticated/anon) jest odrzucany, gdy
--      - ankieta gry jest otwarta (poll_open) -- ludzie właśnie głosują na
--        te pytania/odpowiedzi,
--      - gra jest kopią ze Społeczności (type 'market') -- jej treść
--        pochodzi z market_games i nie jest edytowalna.
--    Funkcje SECURITY DEFINER (zamykanie ankiety, reset, dodanie do
--    biblioteki) działają jako właściciel tabel i przechodzą, tak samo
--    kaskadowe usunięcie całej gry.
--    Błąd: 'game_content_locked:poll_open' / 'game_content_locked:market'.
--
-- 2) Zamknięcie ankiety (status poll_open -> ready): tylko gdy spełnione
--    są te same warunki co w game_validate().poll_close
--    (game_poll_close_check) -- wszyscy zaproszeni zagłosowali, w każdym
--    pytaniu jest sesja i dość głosów / różnych odpowiedzi. Dotyczy też
--    poll_points_close_and_normalize i poll_text_close_apply.
--    Błąd: 'poll_close_blocked:<kod z gameValidate.*>:<nr pytania>'.
--
-- Otwarcie ankiety ma już Warstwę 2 w trg_assert_game_answers_minmax
-- (≥ 10 pytań, 3–6 odpowiedzi w punktacji) i w poll_open (bez gry
-- preparowanej).

create or replace function public.guard_game_content()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_game_id uuid;
  v_type text;
  v_status text;
begin
  -- tylko zapisy prosto z przeglądarki; SECURITY DEFINER i kaskady -> owner
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'questions' then
    v_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  else
    select q.game_id into v_game_id
    from public.questions q
    where q.id = case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  end if;

  select g.type::text, g.status::text into v_type, v_status
  from public.games g
  where g.id = v_game_id;

  if not found then
    return coalesce(new, old);
  end if;

  if v_type = 'market' then
    raise exception 'game_content_locked:market' using errcode = 'P0001';
  end if;

  if v_type in ('poll_text', 'poll_points') and v_status = 'poll_open' then
    raise exception 'game_content_locked:poll_open' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_game_content on public.questions;
create trigger trg_guard_game_content
  before insert or update or delete on public.questions
  for each row execute function public.guard_game_content();

drop trigger if exists trg_guard_game_content on public.answers;
create trigger trg_guard_game_content
  before insert or update or delete on public.answers
  for each row execute function public.guard_game_content();

-- SECURITY DEFINER: game_poll_close_check jest niedostępna dla klientów,
-- a UPDATE statusu z przeglądarki też ma dostać czytelny błąd, nie
-- "permission denied".
create or replace function public.guard_game_poll_close()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chk jsonb;
begin
  if old.status = 'poll_open' and new.status = 'ready'
     and new.type in ('poll_text', 'poll_points') then
    v_chk := public.game_poll_close_check(new.id);
    if not coalesce((v_chk->>'ok')::boolean, false) then
      -- kod + numer pytania, żeby strona mogła pokazać pełny komunikat
      raise exception 'poll_close_blocked:%:%', coalesce(v_chk->>'code', 'unknownType'),
        coalesce(v_chk->'params'->>'ord', '')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_game_poll_close on public.games;
create trigger trg_guard_game_poll_close
  before update of status on public.games
  for each row execute function public.guard_game_poll_close();

notify pgrst, 'reload schema';
