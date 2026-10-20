-- 402: „ankieta” zamiast przestarzałej „sondy/sondażu” w tekstach z bazy
-- (decyzja użytkownika 2026-10-20). Zmiana tylko tekstów: definicje funkcji
-- z bazy z podmienionymi napisami, bez kopiowania reszty ciała. Każdy napis
-- musi istnieć w obecnej definicji, inaczej migracja się przerywa.
--   tasks_list            -- domyślna nazwa gry bez nazwy na liście Zadań
--   game_action_state     -- komunikaty reason_play / reason_poll
--   poll_admin_can_close  -- komunikat, gdy ankieta nie jest otwarta
DO $$
DECLARE
  fixes jsonb := jsonb_build_array(
    jsonb_build_array('public.tasks_list(text)', jsonb_build_object(
      '''Sondaż ''||', '''Ankieta ''||')),
    jsonb_build_array('public.game_action_state(uuid)', jsonb_build_object(
      '''Gra dostępna dopiero po zamknięciu sondażu.''', '''Gra dostępna dopiero po zamknięciu ankiety.''',
      '''Preparowany nie ma sondażu.''', '''Gra preparowana nie ma ankiety.''',
      'blokuj gdy sondaż otwarty', 'blokuj gdy ankieta otwarta')),
    jsonb_build_array('public.poll_admin_can_close(uuid)', jsonb_build_object(
      '''Sondaż nie jest otwarty.''', '''Ankieta nie jest otwarta.'''))
  );
  fix jsonb; v_def text; pair record;
BEGIN
  FOR fix IN SELECT value FROM jsonb_array_elements(fixes) LOOP
    v_def := pg_get_functiondef((fix ->> 0)::regprocedure);
    FOR pair IN SELECT key, value FROM jsonb_each_text(fix -> 1) LOOP
      IF position(pair.key IN v_def) = 0 THEN
        RAISE EXCEPTION '%: nie znaleziono tekstu %', fix ->> 0, pair.key;
      END IF;
      v_def := replace(v_def, pair.key, pair.value);
    END LOOP;
    EXECUTE v_def;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
