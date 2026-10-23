-- Migracje 468–470: zdarzenia sesji, podsumowania, zdarzenia przed startem gry i nowe sygnały.
SELECT
  (SELECT count(*) FROM public.control2_session_events) AS zdarzenia,
  (SELECT count(*) FROM public.control2_session_events WHERE source = 'control') AS zdarzenia_control,
  (SELECT count(*) FROM public.control2_session_events WHERE created_at > now() - interval '1 hour') AS zdarzenia_1h,
  (SELECT count(*) FROM public.control2_session_diag) AS podsumowania,
  (SELECT coalesce(sum(event_count), 0) FROM public.control2_session_diag) AS suma_licznikow,
  (SELECT count(*) FROM public.control2_session_diag WHERE runtime_session_id IS NOT NULL) AS z_sesja_uruchomienia,
  (SELECT count(*) FROM public.control2_session_events WHERE game_session_id IS NULL) AS przed_startem,
  (SELECT count(*) FROM public.control2_session_events WHERE category IN ('device_info', 'wake_lock', 'page_lifecycle')) AS nowe_sygnaly
