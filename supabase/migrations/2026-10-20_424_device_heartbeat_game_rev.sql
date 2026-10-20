-- Control 2: samonaprawa urządzeń, które zgubiły zmianę stanu gry.
-- Heartbeat urządzenia zwraca game_rev; urządzenie ze starszą rewizją
-- przez dwa kolejne heartbeaty (~3 s) samo pobiera stan (kontrola na
-- produkcji 2026-10-20: Przycisk bez przycisków po START_ROUND mimo
-- działającego heartbeatu). Diagnostyka urządzeń przyjmuje wyzwalacz
-- 'lease_heartbeat'. Zmiana dodająca: definicje z bazy, rozszerzone.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.control_device_instance_heartbeat(uuid,text,text,uuid,bigint,jsonb)'::regprocedure);
  v_old text := 'WHERE c.id=p_connection_id));';
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'control_device_instance_heartbeat: nie znaleziono zwracanego obiektu';
  END IF;
  EXECUTE replace(v_def, v_old,
    'WHERE c.id=p_connection_id),' || chr(10) ||
    '      ''game_rev'',(SELECT g.rev FROM public.game_state g WHERE g.game_id=p_game_id));');

  v_def := pg_get_functiondef('public.control2_device_transport_event(uuid,text,text,jsonb,uuid,bigint)'::regprocedure);
  v_old := '''delete_recovery'',''doorbell_ready'',''other''';
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'control2_device_transport_event: nie znaleziono listy wyzwalaczy';
  END IF;
  EXECUTE replace(v_def, v_old, '''delete_recovery'',''doorbell_ready'',''lease_heartbeat'',''other''');
END;
$$;

NOTIFY pgrst, 'reload schema';
