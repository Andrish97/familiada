-- 467: odczyt diagnostyki urządzeń Control dla roli agent_reader (414) —
-- liczby do kontroli pomiaru łącza (466) i opóźnień. Tabela zawiera tylko
-- typy zdarzeń i metryki (bez treści gier i danych osobowych).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
    GRANT SELECT ON public.control2_device_events TO agent_reader;
  END IF;
END $$;
