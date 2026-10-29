-- Migration 275: games.rules_state -- zapisany stan reguł gry
--
-- To samo co game_validate (migracja 273) bez zamknięcia ankiety:
--   { rules, edit, play, poll_entry, poll_open, export }
-- każda akcja { ok } albo { ok: false, code, params }. Liczy go ta sama
-- funkcja (game_rules_compute), więc reguły dalej są w jednym miejscu --
-- kolumna to tylko zapisany wynik. Dzięki temu lista gier dostaje stan
-- razem z grami (kafelki pokazują "niegrywalna: 7/10 pytań" bez zaznaczania),
-- a hub ankiet nie pyta osobno o każdą ankietę.
--
-- Zamknięcie ankiety NIE jest tu zapisywane: zależy od głosów i zaproszeń,
-- które zmieniają się przy każdym oddanym głosie -- liczy je na żądanie
-- game_validate i strażnik z migracji 274.
--
-- Aktualizacja:
--  - games: BEFORE INSERT / UPDATE OF type, status -- stan liczony dla
--    NOWEGO typu/statusu, bez drugiego UPDATE;
--  - questions / answers: AFTER ... FOR EACH STATEMENT z tabelami przejść --
--    jedno przeliczenie na grę na polecenie (import 60 odpowiedzi jednym
--    insertem = jedno przeliczenie, nie 60).
-- Kolumna nie ma być zapisywana przez klientów -- trigger na games i tak ją
-- nadpisuje przy każdej zmianie typu/statusu, a UPDATE samej kolumny z
-- przeglądarki jest zastępowany wartością policzoną.

alter table public.games add column if not exists rules_state jsonb;

-- games: stan dla nowego typu/statusu; ręczny zapis rules_state z przeglądarki
-- też kończy się wartością policzoną
create or replace function public.games_rules_state_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.rules_state := public.game_rules_compute(new.id, new.type::text, new.status::text);
  return new;
end;
$$;

drop trigger if exists trg_games_rules_state on public.games;
create trigger trg_games_rules_state
  before insert or update of type, status, rules_state on public.games
  for each row execute function public.games_rules_state_row();

-- przeliczenie dla zbioru gier (z triggerów treści)
create or replace function public.games_rules_state_refresh(p_game_ids uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  -- wartość liczy trg_games_rules_state (BEFORE UPDATE OF rules_state)
  update public.games g
     set rules_state = null
   where g.id = any(p_game_ids);
$$;

revoke all on function public.games_rules_state_refresh(uuid[]) from public, anon, authenticated;
revoke all on function public.games_rules_state_row() from public, anon, authenticated;

-- questions: game_id wprost z wierszy
create or replace function public.questions_rules_state_stmt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct game_id) into v_ids from new_rows;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct game_id) into v_ids from old_rows;
  else
    select array_agg(distinct game_id) into v_ids
    from (select game_id from new_rows union select game_id from old_rows) x;
  end if;
  if v_ids is not null then
    perform public.games_rules_state_refresh(v_ids);
  end if;
  return null;
end;
$$;

-- answers: game_id przez pytanie. Przy kaskadowym usunięciu pytania/gry
-- pytania już nie ma -- wtedy przelicza trigger na questions (albo gra i
-- tak znika).
create or replace function public.answers_rules_state_stmt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct q.game_id) into v_ids
    from new_rows r join public.questions q on q.id = r.question_id;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct q.game_id) into v_ids
    from old_rows r join public.questions q on q.id = r.question_id;
  else
    select array_agg(distinct q.game_id) into v_ids
    from (select question_id from new_rows union select question_id from old_rows) r
    join public.questions q on q.id = r.question_id;
  end if;
  if v_ids is not null then
    perform public.games_rules_state_refresh(v_ids);
  end if;
  return null;
end;
$$;

-- Osobny trigger na każde zdarzenie: tabele przejść (REFERENCING) nie mogą
-- mieć OLD TABLE dla INSERT ani NEW TABLE dla DELETE.
drop trigger if exists trg_questions_rules_state_ins on public.questions;
drop trigger if exists trg_questions_rules_state_upd on public.questions;
drop trigger if exists trg_questions_rules_state_del on public.questions;
create trigger trg_questions_rules_state_ins after insert on public.questions
  referencing new table as new_rows
  for each statement execute function public.questions_rules_state_stmt();
create trigger trg_questions_rules_state_upd after update on public.questions
  referencing new table as new_rows old table as old_rows
  for each statement execute function public.questions_rules_state_stmt();
create trigger trg_questions_rules_state_del after delete on public.questions
  referencing old table as old_rows
  for each statement execute function public.questions_rules_state_stmt();

drop trigger if exists trg_answers_rules_state_ins on public.answers;
drop trigger if exists trg_answers_rules_state_upd on public.answers;
drop trigger if exists trg_answers_rules_state_del on public.answers;
create trigger trg_answers_rules_state_ins after insert on public.answers
  referencing new table as new_rows
  for each statement execute function public.answers_rules_state_stmt();
create trigger trg_answers_rules_state_upd after update on public.answers
  referencing new table as new_rows old table as old_rows
  for each statement execute function public.answers_rules_state_stmt();
create trigger trg_answers_rules_state_del after delete on public.answers
  referencing old table as old_rows
  for each statement execute function public.answers_rules_state_stmt();

-- Istniejące gry. trg_games_touch wyłączony na czas przeliczenia -- inaczej
-- każda gra dostałaby nowe updated_at ("ostatnio zmieniona") bez zmiany.
alter table public.games disable trigger trg_games_touch;
update public.games set rules_state = null;  -- trigger BEFORE liczy wartość
alter table public.games enable trigger trg_games_touch;

notify pgrst, 'reload schema';
