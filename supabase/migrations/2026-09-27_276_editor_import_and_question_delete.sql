-- Migration 276: edytor gry -- atomowy import TXT i usuwanie pytania
-- (audyt strony /editor, e2e/editor.spec.js)
--
-- 1) game_import_content(p_game_id, p_name, p_questions)
--    Import TXT w edytorze najpierw kasował wszystkie pytania gry, a potem
--    dokładał je po jednym (2 zapytania na pytanie + 1 na odpowiedź, dla
--    10 pytań x 6 odpowiedzi ~80 zapytań). Błąd sieci / odrzucenie w połowie
--    zostawiało grę z połową pytań albo pustą -- stara zawartość była już
--    skasowana. Teraz to jedna funkcja = jedna transakcja: albo cały import,
--    albo nic się nie zmienia.
--
-- 2) game_question_delete(p_question_id) + game_questions_renumber(p_game_id)
--    Usunięcie pytania to było: DELETE odpowiedzi, DELETE pytania, potem
--    osobny UPDATE ord dla każdego kolejnego pytania. Przerwane w połowie
--    zostawiało dziury / podwójne numery.
--
-- Wszystkie trzy są SECURITY INVOKER (domyślnie): działają z uprawnieniami
-- zalogowanego użytkownika, więc obowiązuje RLS (tylko własne gry) i
-- Warstwa 2 z migracji 274 (trg_guard_game_content odrzuca zapis przy
-- otwartej ankiecie / w kopii ze Społeczności -- 'game_content_locked:*').
-- Pytania i odpowiedzi idą po jednym INSERT-cie na tabelę, więc
-- games.rules_state (migracja 275) przelicza się raz, nie na każdy wiersz.
--
-- Teksty (domyślne "Pytanie 3" / "ODP 2" są tłumaczone) i punkty normalizuje
-- strona (js/core/question-form.js); tu tylko twarde przycięcie do limitów
-- kolumn, reszty pilnują CHECK-i tabel.

create or replace function public.game_import_content(
  p_game_id uuid,
  p_name text,
  p_questions jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_type text;
  v_count int;
begin
  if jsonb_typeof(p_questions) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;

  -- RLS: cudza / nieistniejąca gra -> brak wiersza
  select g.type::text into v_type
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is not null then
    update public.games
       set name = left(btrim(p_name), 80)
     where id = p_game_id;
  end if;

  -- odpowiedzi idą kaskadą (answers_question_id_fkey ON DELETE CASCADE)
  delete from public.questions where game_id = p_game_id;

  insert into public.questions (game_id, ord, text)
  select p_game_id, s.ord, left(btrim(coalesce(s.item->>'text', '')), 200)
  from jsonb_array_elements(p_questions) with ordinality as s(item, ord);

  get diagnostics v_count = row_count;

  -- typowa ankieta: same pytania
  if v_type <> 'poll_text' then
    insert into public.answers (question_id, ord, text, fixed_points)
    select q.id,
           a.ord,
           left(btrim(coalesce(a.item->>'text', '')), 17),
           case
             when v_type = 'prepared' and jsonb_typeof(a.item->'points') = 'number'
               then least(100, greatest(0, floor((a.item->>'points')::numeric)))::int
             else 0
           end
    from jsonb_array_elements(p_questions) with ordinality as s(item, ord)
    join public.questions q on q.game_id = p_game_id and q.ord = s.ord
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.item->'answers') = 'array' then s.item->'answers' else '[]'::jsonb end
    ) with ordinality as a(item, ord)
    where a.ord <= 6;  -- answers_ord_range
  end if;

  return jsonb_build_object('ok', true, 'questions', v_count);
end;
$$;

create or replace function public.game_questions_renumber(p_game_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
begin
  update public.questions q
     set ord = r.rn
    from (
      select id, row_number() over (order by ord, id)::int as rn
      from public.questions
      where game_id = p_game_id
    ) r
   where q.id = r.id
     and q.ord <> r.rn;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.game_question_delete(p_question_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_game_id uuid;
begin
  delete from public.questions
   where id = p_question_id
  returning game_id into v_game_id;

  -- usunięte gdzie indziej albo cudze (RLS) -- strona traktuje jak ROW_GONE
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform public.game_questions_renumber(v_game_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.game_import_content(uuid, text, jsonb) from public, anon;
revoke all on function public.game_questions_renumber(uuid) from public, anon;
revoke all on function public.game_question_delete(uuid) from public, anon;
grant execute on function public.game_import_content(uuid, text, jsonb) to authenticated;
grant execute on function public.game_questions_renumber(uuid) to authenticated;
grant execute on function public.game_question_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
