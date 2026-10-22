-- Migracja 468: przeniesione i nowe zdarzenia sesji, podsumowania, stara tabela.
SELECT
  (SELECT count(*) FROM public.control2_session_events) AS zdarzenia,
  (SELECT count(*) FROM public.control2_session_events WHERE source = 'control') AS zdarzenia_control,
  (SELECT count(*) FROM public.control2_session_events WHERE created_at > now() - interval '1 hour') AS zdarzenia_1h,
  (SELECT count(*) FROM public.control2_session_diag) AS podsumowania,
  (SELECT coalesce(sum(event_count), 0) FROM public.control2_session_diag) AS suma_licznikow,
  (SELECT count(*) FROM public.control2_session_diag WHERE runtime_session_id IS NOT NULL) AS z_sesja_uruchomienia,
  (SELECT count(*) FROM public.control2_device_events) AS stara_tabela,
  (SELECT count(*) FROM public.control2_device_events WHERE created_at > now() - interval '1 hour') AS stara_tabela_1h
