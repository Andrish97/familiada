-- Migracja 466: funkcje pomiaru łącza istnieją i są dostępne dla anon/authenticated;
-- liczba zapisanych pomiarów (wszystkie, z ostatniej godziny i z werdyktem „wolno”).
SELECT has_function_privilege('anon', 'public.control2_net_ping()', 'execute') AS ping_anon,
       has_function_privilege('anon', 'public.control2_network_probe_event(uuid,text,text,jsonb,uuid,bigint)', 'execute') AS probe_anon,
       has_function_privilege('authenticated', 'public.control2_network_probe_event(uuid,text,text,jsonb,uuid,bigint)', 'execute') AS probe_auth,
       (SELECT count(*) FROM public.control2_device_events WHERE event_type = 'network_state' AND details->>'source' = 'probe') AS pomiary,
       (SELECT count(*) FROM public.control2_device_events WHERE event_type = 'network_state' AND details->>'source' = 'probe' AND created_at > now() - interval '1 hour') AS pomiary_1h,
       (SELECT count(*) FROM public.control2_device_events WHERE event_type = 'network_state' AND details->>'phase' = 'slow') AS spowolnienia
