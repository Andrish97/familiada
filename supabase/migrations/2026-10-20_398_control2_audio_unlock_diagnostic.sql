-- Control 2: diagnostyka czekania na odblokowanie dźwięku Wyświetlacza.
-- control2_session_ping przyjmuje nową kategorię 'audio_unlock' (czas blokady
-- gry, powód: nowa instancja Wyświetlacza lub wstrzymanie dźwięku przez
-- przeglądarkę, wynik). Zmiana dodająca: definicja funkcji z bazy z
-- rozszerzoną listą kategorii, bez kopiowania reszty ciała.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.control2_session_ping(uuid,jsonb)'::regprocedure);
  v_old text := 'NOT IN (''connectivity'',''audio_start'',''display_delay'',''state_sync'',''realtime'')';
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'control2_session_ping: nie znaleziono listy kategorii diagnostyki';
  END IF;
  EXECUTE replace(v_def, v_old,
    'NOT IN (''connectivity'',''audio_start'',''audio_unlock'',''display_delay'',''state_sync'',''realtime'')');
END;
$$;

NOTIFY pgrst, 'reload schema';
